import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SecretStore } from './provider.js';

/** AES-256-GCM. Định dạng: v1:<iv b64>:<tag b64>:<cipher b64>. */
export class AesSecretStore implements SecretStore {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('Secret key phải dài 32 byte');
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
  }
  decrypt(cipher: string): string {
    const [v, iv, tag, data] = cipher.split(':');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Dữ liệu mã hóa không hợp lệ');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  }
}

/** Key ở `<dataDir>/secret.key` (tạo khi dùng lần đầu); không có dataDir → key ngẫu nhiên trong bộ nhớ. */
export function createSecretStore(dataDir?: string): SecretStore {
  if (!dataDir) return new AesSecretStore(randomBytes(32));
  const file = join(dataDir, 'secret.key');
  let key: Buffer;
  if (existsSync(file)) {
    key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  } else {
    mkdirSync(dataDir, { recursive: true });
    key = randomBytes(32);
    writeFileSync(file, key.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  }
  return new AesSecretStore(key);
}
