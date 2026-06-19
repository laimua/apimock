/**
 * AES-256-GCM 加密工具
 * 用于加密存储 API Key 等敏感信息
 *
 * 新格式 (v2): salt:iv:authTag:encrypted  — 随机 salt
 * 旧格式 (v1): iv:authTag:encrypted       — 静态 salt（向后兼容）
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'salt';
const SALT_LENGTH = 16;

/**
 * 派生 key 缓存：scryptSync 故意慢，同一 ENCRYPTION_KEY + salt 组合反复调用
 * 会浪费几十 ms。AI 生成链路每次 decrypt(provider.apiKey) 都触发，缓存可
 * 把后续调用降到 ~0ms。
 *
 * 仅按 (secret, saltHex) 缓存认为输出确定——scrypt 同输入同输出。
 */
const deriveKeyCache = new Map<string, Buffer>();

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is required. Set it before starting the server.');
  }
  return secret;
}

function getCachedDerivedKey(secret: string, salt: Buffer): Buffer {
  const saltHex = salt.toString('hex');
  const cacheKey = `${secret.length}:${saltHex}`;
  const cached = deriveKeyCache.get(cacheKey);
  if (cached) return cached;
  const derived = crypto.scryptSync(secret, salt, 32);
  deriveKeyCache.set(cacheKey, derived);
  return derived;
}

function getMasterKey(): Buffer {
  return getCachedDerivedKey(getSecret(), Buffer.from(LEGACY_SALT));
}

function deriveKey(salt: Buffer): Buffer {
  return getCachedDerivedKey(getSecret(), salt);
}

/**
 * 测试/重置用：清空 key 缓存。生产代码不应调用。
 */
export function _clearEncryptionKeyCache(): void {
  deriveKeyCache.clear();
}

/**
 * 加密文本
 * 使用随机 salt，输出格式: salt:iv:authTag:encrypted (v2)
 */
export function encrypt(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(16);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密文本
 * 自动识别 v2 (4段: salt:iv:authTag:encrypted) 和 v1 (3段: iv:authTag:encrypted)
 */
export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');

  let key: Buffer;
  let iv: Buffer;
  let authTag: Buffer;
  let encrypted: string;

  if (parts.length === 4) {
    // v2: 随机 salt
    const [saltHex, ivHex, authTagHex, enc] = parts;
    key = deriveKey(Buffer.from(saltHex, 'hex'));
    iv = Buffer.from(ivHex, 'hex');
    authTag = Buffer.from(authTagHex, 'hex');
    encrypted = enc;
  } else if (parts.length === 3) {
    // v1: 静态 salt（向后兼容已有数据）
    const [ivHex, authTagHex, enc] = parts;
    key = getMasterKey();
    iv = Buffer.from(ivHex, 'hex');
    authTag = Buffer.from(authTagHex, 'hex');
    encrypted = enc;
  } else {
    throw new Error('Invalid encrypted data format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  try {
    decrypted += decipher.final('utf8');
  } catch {
    throw new Error('Decryption failed: invalid key or corrupted data');
  }

  return decrypted;
}

/**
 * 遮盖 API Key（用于前端显示）
 * @param apiKey 原始 API Key
 * @returns 遮盖后的字符串（如: sk-***...***xxx）
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) {
    return '***';
  }
  const prefix = apiKey.substring(0, 7);
  const suffix = apiKey.substring(apiKey.length - 3);
  return `${prefix}***...***${suffix}`;
}
