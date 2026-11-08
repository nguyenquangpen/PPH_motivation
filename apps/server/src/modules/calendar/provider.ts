/**
 * Lớp kết nối lịch. Bản Google: google-provider.ts (@googleapis/calendar + google-auth-library).
 * Bản giả lập cho test: fake-provider.ts. Đổi tool kết nối về sau = viết một implementation khác của interface này.
 */
export type EventInput = {
  calendarId: string;             // 'primary'
  title: string;
  description: string;
  start: string;                  // ISO
  end: string;                    // ISO
  hubSessionId: string;           // lưu vào extendedProperties.private.pphSessionId
};

export type ProviderEvent = {
  id: string;
  calendarId: string;
  start: string;                  // ISO; với sự kiện cả ngày: 00:00 theo múi giờ lịch
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'cancelled';
  transparency: 'opaque' | 'transparent';
  declinedBySelf: boolean;
  title: string;
  hubSessionId: string | null;
};

export type ProviderChanges = { events: ProviderEvent[]; nextSyncToken: string; fullResync: boolean };

export interface CalendarProvider {
  /** Đăng nhập (OAuth loopback). Trả email tài khoản + token (chuỗi JSON, Hub sẽ mã hóa khi lưu). */
  connect(): Promise<{ accountEmail: string; tokens: string }>;
  /** Nạp token đã lưu (null = đăng xuất). */
  useTokens(tokens: string | null): void;
  /** Token mới nếu thư viện đã tự làm mới (để Hub lưu lại); null nếu không đổi. */
  takeRefreshedTokens(): string | null;
  listCalendars(): Promise<{ id: string; name: string; primary: boolean }[]>;
  createEvent(input: EventInput): Promise<ProviderEvent>;
  updateEvent(eventId: string, input: EventInput): Promise<ProviderEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  getEvent(calendarId: string, eventId: string): Promise<ProviderEvent | null>;
  /** Tìm Event của Hub theo pphSessionId (chống tạo trùng khi không rõ lần tạo trước có thành công không). */
  findHubEvent(calendarId: string, hubSessionId: string): Promise<ProviderEvent | null>;
  /** Thay đổi kể từ syncToken; syncToken null hoặc hết hạn → tải lại toàn bộ trong cửa sổ (fullResync = true). */
  listChanges(calendarId: string, syncToken: string | null, window: { from: string; to: string }): Promise<ProviderChanges>;
}

/** Lỗi chuẩn hóa từ provider */
export class ProviderAuthError extends Error {}
export class ProviderTransientError extends Error {}
export class ProviderNotFound extends Error {}

/** Lưu bí mật (token Google) dạng mã hóa. */
export interface SecretStore {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}
