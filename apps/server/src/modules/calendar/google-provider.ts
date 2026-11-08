import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { calendar, type calendar_v3 } from '@googleapis/calendar';
import { CodeChallengeMethod, OAuth2Client, type Credentials } from 'google-auth-library';
import {
  ProviderAuthError, ProviderNotFound, ProviderTransientError,
  type CalendarProvider, type ConnectOptions, type EventInput, type ProviderChanges, type ProviderEvent,
} from './provider.js';

export type OAuthClientConfig = { clientId: string; clientSecret: string };

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar'];
const CONNECT_TIMEOUT_MS = 10 * 60_000;

/**
 * Google Calendar thật: OAuth desktop (loopback 127.0.0.1 cổng ngẫu nhiên + PKCE), @googleapis/calendar.
 * Client id/secret do Owner tạo (Google Cloud project của Owner, loại "Desktop app") → getConfig().
 */
export class GoogleCalendarProvider implements CalendarProvider {
  private client: OAuth2Client | null = null;
  private creds: Credentials | null = null;
  private refreshed: string | null = null;

  constructor(private getConfig: () => OAuthClientConfig | null) {}

  async connect(opts?: ConnectOptions): Promise<{ accountEmail: string; tokens: string }> {
    const cfg = this.getConfig();
    if (!cfg) throw new ProviderAuthError('Chưa cấu hình OAuth client (client id/secret)');
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    try {
      const port = (server.address() as { port: number }).port;
      const redirectUri = `http://127.0.0.1:${port}`;
      const client = new OAuth2Client({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri });
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const state = randomBytes(16).toString('hex');
      const authUrl = client.generateAuthUrl({
        access_type: 'offline', prompt: 'consent', scope: SCOPES, state,
        code_challenge_method: CodeChallengeMethod.S256, code_challenge: codeChallenge,
      });
      opts?.onAuthUrl?.(authUrl);

      const code = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ProviderAuthError('Hết thời gian chờ đăng nhập Google')), CONNECT_TIMEOUT_MS);
        server.on('request', (req, res) => {
          const u = new URL(req.url ?? '/', redirectUri);
          if (u.pathname !== '/') {
            res.statusCode = 404;
            res.end();
            return;
          }
          const err = u.searchParams.get('error');
          const c = u.searchParams.get('code');
          const ok = !err && c && u.searchParams.get('state') === state;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(ok
            ? '<html><body><h3>Đã kết nối Google Calendar. Bạn có thể đóng tab này.</h3></body></html>'
            : '<html><body><h3>Kết nối Google Calendar thất bại. Hãy thử lại trong Hub.</h3></body></html>');
          clearTimeout(timer);
          if (ok) resolve(c!);
          else reject(new ProviderAuthError(`Google từ chối đăng nhập: ${err ?? 'state không khớp'}`));
        });
      });

      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      let email: string | undefined;
      if (tokens.id_token) {
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: cfg.clientId });
        email = ticket.getPayload()?.email;
      }
      if (!email && tokens.access_token) email = (await client.getTokenInfo(tokens.access_token)).email;
      if (!email) throw new ProviderAuthError('Không đọc được email tài khoản Google');
      return { accountEmail: email, tokens: JSON.stringify(tokens) };
    } finally {
      server.close();
    }
  }

  useTokens(tokens: string | null): void {
    this.refreshed = null;
    if (!tokens) {
      this.client = null;
      this.creds = null;
      return;
    }
    const cfg = this.getConfig();
    this.creds = JSON.parse(tokens) as Credentials;
    if (!cfg) {
      this.client = null;
      return;
    }
    const client = new OAuth2Client({ clientId: cfg.clientId, clientSecret: cfg.clientSecret });
    client.setCredentials(this.creds);
    client.on('tokens', (t) => {
      this.creds = { ...this.creds, ...t, refresh_token: t.refresh_token ?? this.creds?.refresh_token };
      this.refreshed = JSON.stringify(this.creds);
    });
    this.client = client;
  }

  takeRefreshedTokens(): string | null {
    const t = this.refreshed;
    this.refreshed = null;
    return t;
  }

  async listCalendars() {
    return this.call(async (api) => {
      const out: { id: string; name: string; primary: boolean }[] = [];
      let pageToken: string | undefined;
      do {
        const r = await api.calendarList.list({ pageToken, maxResults: 250 });
        for (const c of r.data.items ?? []) {
          out.push({ id: c.primary ? 'primary' : c.id!, name: c.summaryOverride ?? c.summary ?? c.id ?? '', primary: !!c.primary });
        }
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    });
  }

  async createEvent(input: EventInput): Promise<ProviderEvent> {
    return this.call(async (api) => {
      const r = await api.events.insert({ calendarId: input.calendarId, requestBody: body(input) });
      return mapEvent(r.data, input.calendarId);
    });
  }

  async updateEvent(eventId: string, input: EventInput): Promise<ProviderEvent> {
    return this.call(async (api) => {
      const r = await api.events.patch({ calendarId: input.calendarId, eventId, requestBody: body(input) });
      if (r.data.status === 'cancelled') throw new ProviderNotFound(`Event ${eventId} đã bị xóa`);
      return mapEvent(r.data, input.calendarId);
    });
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.call(async (api) => {
      await api.events.delete({ calendarId, eventId });
    });
  }

  async getEvent(calendarId: string, eventId: string): Promise<ProviderEvent | null> {
    try {
      return await this.call(async (api) => {
        const r = await api.events.get({ calendarId, eventId });
        return r.data.status === 'cancelled' ? null : mapEvent(r.data, calendarId);
      });
    } catch (e) {
      if (e instanceof ProviderNotFound) return null;
      throw e;
    }
  }

  async findHubEvent(calendarId: string, hubSessionId: string): Promise<ProviderEvent | null> {
    return this.call(async (api) => {
      const r = await api.events.list({ calendarId, privateExtendedProperty: [`pphSessionId=${hubSessionId}`], showDeleted: false, maxResults: 5 });
      const e = (r.data.items ?? []).find((x) => x.status !== 'cancelled');
      return e ? mapEvent(e, calendarId) : null;
    });
  }

  async listChanges(calendarId: string, syncToken: string | null, window: { from: string; to: string }): Promise<ProviderChanges> {
    try {
      return await this.call(async (api) => {
        const events: ProviderEvent[] = [];
        let pageToken: string | undefined;
        let nextSyncToken: string | undefined;
        do {
          const params: calendar_v3.Params$Resource$Events$List = { calendarId, singleEvents: true, maxResults: 2500, pageToken };
          if (syncToken) params.syncToken = syncToken;
          else Object.assign(params, { timeMin: window.from, timeMax: window.to, showDeleted: false });
          const r = await api.events.list(params);
          for (const e of r.data.items ?? []) events.push(mapEvent(e, calendarId));
          pageToken = r.data.nextPageToken ?? undefined;
          nextSyncToken = r.data.nextSyncToken ?? nextSyncToken;
        } while (pageToken);
        return { events, nextSyncToken: nextSyncToken ?? '', fullResync: !syncToken };
      }, true);
    } catch (e) {
      // 410 Gone: syncToken hết hạn → tải lại toàn bộ cửa sổ
      if (e instanceof SyncTokenExpired && syncToken) return this.listChanges(calendarId, null, window);
      throw e;
    }
  }

  // ---------------- nội bộ ----------------
  private async call<T>(fn: (api: calendar_v3.Calendar) => Promise<T>, listing = false): Promise<T> {
    if (!this.client) throw new ProviderAuthError(this.creds ? 'Chưa cấu hình OAuth client' : 'Chưa đăng nhập Google');
    const api = calendar({ version: 'v3', auth: this.client });
    try {
      return await fn(api);
    } catch (e) {
      throw mapError(e, listing);
    }
  }
}

class SyncTokenExpired extends Error {}

function body(input: EventInput): calendar_v3.Schema$Event {
  return {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    reminders: { useDefault: true },
    extendedProperties: { private: { pphSessionId: input.hubSessionId } },
  };
}

function mapEvent(e: calendar_v3.Schema$Event, calendarId: string): ProviderEvent {
  const allDay = !!e.start?.date;
  const iso = (t?: calendar_v3.Schema$EventDateTime) =>
    t?.dateTime ? new Date(t.dateTime).toISOString() : t?.date ? new Date(`${t.date}T00:00:00Z`).toISOString() : '';
  return {
    id: e.id!,
    calendarId,
    start: iso(e.start),
    end: iso(e.end),
    allDay,
    status: e.status === 'cancelled' ? 'cancelled' : 'confirmed',
    transparency: e.transparency === 'transparent' ? 'transparent' : 'opaque',
    declinedBySelf: !!e.attendees?.some((a) => a.self && a.responseStatus === 'declined'),
    title: e.summary ?? '',
    hubSessionId: e.extendedProperties?.private?.pphSessionId ?? null,
  };
}

function mapError(e: unknown, listing: boolean): Error {
  if (e instanceof ProviderAuthError || e instanceof ProviderNotFound || e instanceof ProviderTransientError) return e;
  const err = e as { code?: number | string; status?: number; response?: { status?: number; data?: any }; message?: string };
  const status = Number(err.response?.status ?? err.status ?? (typeof err.code === 'number' ? err.code : NaN));
  const msg = String(err.message ?? e);
  if (/invalid_grant|invalid_client|unauthorized_client/i.test(msg) || status === 401) return new ProviderAuthError(msg);
  if (status === 410 && listing) return new SyncTokenExpired(msg);
  if (status === 404 || status === 410) return new ProviderNotFound(msg);
  if (status === 403) {
    const reason = JSON.stringify(err.response?.data ?? '');
    return /rateLimit|userRateLimit|quota/i.test(reason + msg) ? new ProviderTransientError(msg) : new ProviderAuthError(msg);
  }
  return new ProviderTransientError(msg); // 429, 5xx, mạng
}
