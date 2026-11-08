-- Release 2 / calendar: OAuth client của Owner (secret mã hóa) + số thứ tự thay đổi của mapping (chống ghi đè khi đang đẩy)
ALTER TABLE calendar_connection ADD COLUMN oauth_client_id TEXT;
ALTER TABLE calendar_connection ADD COLUMN oauth_client_secret_enc TEXT;
ALTER TABLE calendar_mappings ADD COLUMN op_seq INTEGER NOT NULL DEFAULT 0;
-- Giờ Hub đẩy lên gần nhất (để nhận ra "tiếng vọng" của chính Hub khi đọc thay đổi)
ALTER TABLE calendar_mappings ADD COLUMN pushed_start TEXT;
ALTER TABLE calendar_mappings ADD COLUMN pushed_end TEXT;
