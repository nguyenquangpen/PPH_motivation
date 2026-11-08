import {
  ProviderAuthError, ProviderNotFound, ProviderTransientError,
  type CalendarProvider, type ConnectOptions, type EventInput, type ProviderChanges, type ProviderEvent,
} from './provider.js';

/**
 * Google Calendar giả lập trong bộ nhớ (test + e2e). Mỗi tài khoản có kho lịch riêng.
 * Hỗ trợ: nhiều lịch, syncToken, Free/transparent, từ chối, cả ngày, lặp lại (đã mở rộng sẵn thành từng lần),
 * tiêm lỗi (failNext) và độ trễ (setLatency). Mọi lời gọi của Hub được ghi vào `calls`.
 */
export type FakeEvent = ProviderEvent & { description: string; seq: number; recurringInstance: boolean };
export type FailKind = 'auth' | 'transient' | 'lostResponse';
export type FakeCall = { method: string; calendarId?: string; eventId?: string; hubSessionId?: string };

type Store = { calendars: { id: string; name: string; primary: boolean }[]; events: Map<string, FakeEvent> };

export type ExternalEventInput = {
  calendarId?: string; title?: string; start: string; end: string; allDay?: boolean;
  transparency?: 'opaque' | 'transparent'; declined?: boolean;
  /** Lặp hằng ngày N lần (mỗi lần là một instance riêng như singleEvents=true) */
  dailyCount?: number;
};

const key = (calendarId: string, id: string) => `${calendarId}/${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FakeCalendarProvider implements CalendarProvider {
  private stores = new Map<string, Store>();
  private seq = 0;
  private idSeq = 0;
  private tokens: string | null = null;
  private failures: { kind: FailKind; remaining: number }[] = [];
  private latencyMs = 0;
  private invalidTokens = false;
  /** Tài khoản trả về ở lần connect() kế tiếp */
  nextConnectEmail = 'owner@example.com';
  calls: FakeCall[] = [];

  // ---------------- điều khiển từ test ----------------
  failNext(n: number, kind: FailKind = 'transient'): void {
    this.failures.push({ kind, remaining: n });
  }
  clearFailures(): void {
    this.failures = [];
  }
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }
  /** Lần listChanges kế tiếp với syncToken cũ → 410 (fullResync) */
  invalidateSyncTokens(): void {
    this.invalidTokens = true;
  }
  addCalendar(id: string, name: string, account = this.currentEmail()): void {
    const st = this.store(account);
    if (!st.calendars.some((c) => c.id === id)) st.calendars.push({ id, name, primary: false });
  }
  countCalls(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  /** Event còn sống của một lịch (mặc định primary) */
  listEvents(calendarId = 'primary', account = this.currentEmail()): FakeEvent[] {
    return [...this.store(account).events.values()].filter((e) => e.calendarId === calendarId && e.status === 'confirmed');
  }
  hubEvents(calendarId = 'primary', account = this.currentEmail()): FakeEvent[] {
    return this.listEvents(calendarId, account).filter((e) => e.hubSessionId);
  }
  findEvent(eventId: string, account = this.currentEmail()): FakeEvent | undefined {
    return [...this.store(account).events.values()].find((e) => e.id === eventId && e.status === 'confirmed');
  }

  /** Owner tạo Event trực tiếp trên Google. Trả về id (hoặc id các instance nếu lặp). */
  addExternalEvent(input: ExternalEventInput): string[] {
    const calendarId = input.calendarId ?? 'primary';
    this.addCalendar(calendarId, calendarId);
    const n = input.dailyCount ?? 1;
    const base = `ext_${++this.idSeq}`;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const shift = i * 86_400_000;
      const id = n > 1 ? `${base}_${i}` : base;
      this.put({
        id, calendarId, title: input.title ?? 'Event', description: '',
        start: new Date(new Date(input.start).getTime() + shift).toISOString(),
        end: new Date(new Date(input.end).getTime() + shift).toISOString(),
        allDay: input.allDay ?? false, status: 'confirmed', transparency: input.transparency ?? 'opaque',
        declinedBySelf: input.declined ?? false, hubSessionId: null, recurringInstance: n > 1, seq: 0,
      });
      ids.push(id);
    }
    return ids;
  }
  moveEvent(eventId: string, start: string, end: string): void {
    const e = this.mustFind(eventId);
    this.put({ ...e, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  }
  renameEvent(eventId: string, title: string): void {
    this.put({ ...this.mustFind(eventId), title });
  }
  convertToAllDay(eventId: string): void {
    this.put({ ...this.mustFind(eventId), allDay: true });
  }
  moveToCalendar(eventId: string, calendarId: string): void {
    const e = this.mustFind(eventId);
    this.addCalendar(calendarId, calendarId);
    this.put({ ...e, status: 'cancelled' });
    this.put({ ...e, calendarId });
  }
  /** Owner xóa Event trên Google (không ghi vào calls) */
  ownerDeleteEvent(eventId: string): void {
    this.put({ ...this.mustFind(eventId), status: 'cancelled' });
  }
  /** Gom helper "phía Owner" (deleteEvent trùng tên với hàm của interface nên đặt ở đây) */
  readonly owner = {
    addExternalEvent: (i: ExternalEventInput) => this.addExternalEvent(i),
    moveEvent: (id: string, s: string, e: string) => this.moveEvent(id, s, e),
    deleteEvent: (id: string) => this.ownerDeleteEvent(id),
    convertToAllDay: (id: string) => this.convertToAllDay(id),
    moveToCalendar: (id: string, cal: string) => this.moveToCalendar(id, cal),
    renameEvent: (id: string, t: string) => this.renameEvent(id, t),
  };

  // ---------------- CalendarProvider ----------------
  async connect(opts?: ConnectOptions): Promise<{ accountEmail: string; tokens: string }> {
    this.calls.push({ method: 'connect' });
    opts?.onAuthUrl?.('https://accounts.google.test/o/oauth2/auth?fake=1');
    const accountEmail = this.nextConnectEmail;
    this.store(accountEmail);
    return { accountEmail, tokens: JSON.stringify({ email: accountEmail, access_token: `fake-token-${accountEmail}` }) };
  }
  useTokens(tokens: string | null): void {
    this.tokens = tokens;
  }
  takeRefreshedTokens(): string | null {
    return null;
  }
  async listCalendars() {
    await this.enter('listCalendars');
    return this.store(this.currentEmail()).calendars.map((c) => ({ ...c }));
  }
  async createEvent(input: EventInput): Promise<ProviderEvent> {
    const lost = await this.enter('createEvent', { calendarId: input.calendarId, hubSessionId: input.hubSessionId }, true);
    const id = `hub_${++this.idSeq}`;
    const e = this.put({
      id, calendarId: input.calendarId, title: input.title, description: input.description,
      start: new Date(input.start).toISOString(), end: new Date(input.end).toISOString(), allDay: false,
      status: 'confirmed', transparency: 'opaque', declinedBySelf: false, hubSessionId: input.hubSessionId,
      recurringInstance: false, seq: 0,
    });
    if (lost) throw new ProviderTransientError('Mất phản hồi (giả lập)');
    return strip(e);
  }
  async updateEvent(eventId: string, input: EventInput): Promise<ProviderEvent> {
    const lost = await this.enter('updateEvent', { calendarId: input.calendarId, eventId }, true);
    const e = this.findIn(input.calendarId, eventId);
    if (!e) throw new ProviderNotFound(`Event ${eventId} không tồn tại`);
    const next = this.put({
      ...e, title: input.title, description: input.description,
      start: new Date(input.start).toISOString(), end: new Date(input.end).toISOString(),
    });
    if (lost) throw new ProviderTransientError('Mất phản hồi (giả lập)');
    return strip(next);
  }
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.enter('deleteEvent', { calendarId, eventId });
    const e = this.findIn(calendarId, eventId);
    if (!e) throw new ProviderNotFound(`Event ${eventId} không tồn tại`);
    this.put({ ...e, status: 'cancelled' });
  }
  async getEvent(calendarId: string, eventId: string): Promise<ProviderEvent | null> {
    await this.enter('getEvent', { calendarId, eventId });
    const e = this.findIn(calendarId, eventId);
    return e ? strip(e) : null;
  }
  async findHubEvent(calendarId: string, hubSessionId: string): Promise<ProviderEvent | null> {
    await this.enter('findHubEvent', { calendarId, hubSessionId });
    const e = this.listEvents(calendarId).find((x) => x.hubSessionId === hubSessionId);
    return e ? strip(e) : null;
  }
  async listChanges(calendarId: string, syncToken: string | null, window: { from: string; to: string }): Promise<ProviderChanges> {
    await this.enter('listChanges', { calendarId });
    const all = [...this.store(this.currentEmail()).events.values()].filter((e) => e.calendarId === calendarId);
    const since = syncToken && !this.invalidTokens ? Number(syncToken.replace('seq:', '')) : null;
    this.invalidTokens = false;
    const next = `seq:${this.seq}`;
    if (since === null || Number.isNaN(since)) {
      const from = new Date(window.from).getTime();
      const to = new Date(window.to).getTime();
      const events = all.filter((e) => e.status === 'confirmed' && new Date(e.end).getTime() > from && new Date(e.start).getTime() < to);
      return { events: events.map(strip), nextSyncToken: next, fullResync: true };
    }
    return { events: all.filter((e) => e.seq > since).map(strip), nextSyncToken: next, fullResync: false };
  }

  // ---------------- nội bộ ----------------
  private currentEmail(): string {
    if (this.tokens) {
      try {
        return (JSON.parse(this.tokens) as { email: string }).email;
      } catch { /* ignore */ }
    }
    return this.nextConnectEmail;
  }
  private store(email: string): Store {
    let st = this.stores.get(email);
    if (!st) {
      st = { calendars: [{ id: 'primary', name: email, primary: true }], events: new Map() };
      this.stores.set(email, st);
    }
    return st;
  }
  private put(e: FakeEvent): FakeEvent {
    const v = { ...e, seq: ++this.seq };
    this.store(this.currentEmail()).events.set(key(v.calendarId, v.id), v);
    return v;
  }
  private findIn(calendarId: string, eventId: string): FakeEvent | undefined {
    const e = this.store(this.currentEmail()).events.get(key(calendarId, eventId));
    return e && e.status === 'confirmed' ? e : undefined;
  }
  private mustFind(eventId: string): FakeEvent {
    const e = this.findEvent(eventId);
    if (!e) throw new Error(`Fake: Event ${eventId} không tồn tại`);
    return e;
  }
  /** Ghi lời gọi, chờ độ trễ, áp lỗi tiêm. Trả về true nếu phải "mất phản hồi" sau khi thực hiện. */
  private async enter(method: string, info: Omit<FakeCall, 'method'> = {}, canLose = false): Promise<boolean> {
    this.calls.push({ method, ...info });
    if (this.latencyMs > 0) await sleep(this.latencyMs);
    if (!this.tokens) throw new ProviderAuthError('Chưa đăng nhập');
    const f = this.failures[0];
    if (!f) return false;
    if (--f.remaining <= 0) this.failures.shift();
    if (f.kind === 'auth') throw new ProviderAuthError('401 invalid_grant (giả lập)');
    if (f.kind === 'lostResponse' && canLose) return true;
    throw new ProviderTransientError('503 (giả lập)');
  }
}

const strip = (e: FakeEvent): ProviderEvent => ({
  id: e.id, calendarId: e.calendarId, start: e.start, end: e.end, allDay: e.allDay, status: e.status,
  transparency: e.transparency, declinedBySelf: e.declinedBySelf, title: e.title, hubSessionId: e.hubSessionId,
});
