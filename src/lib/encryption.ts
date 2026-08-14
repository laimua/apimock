/**
 * AES-256-GCM 加密工具
 * 用于加密存储 API Key 等敏感信息
 *
 * 新格式 (v2): salt:iv:authTag:encrypted  — 随机 salt
 * 旧格式 (v1): iv:authTag:encrypted       — 静态 salt（向后兼容）
 */

import crypto from 'crypto';
import { logger } from './logger';

// C3: cacheKey 用 sha256(secret+salt) 完整 digest。旧格式 `${secret.length}:${saltHex}`
// 只按 secret 长度区分——轮换 ENCRYPTION_KEY 后新旧 key 同长会命中同一条缓存,
// decrypt 拿旧 key 解新数据静默失败。截断(前 8 hex)虽碰撞概率低,但完整 64 hex
// digest 零歧义且 Map key 开销可忽略,不再截断。

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'salt';
const SALT_LENGTH = 16;

/**
 * 派生 key 缓存：scryptSync 故意慢，同一 ENCRYPTION_KEY + salt 组合反复调用
 * 会浪费几十 ms。AI 生成链路每次 decrypt(provider.apiKey) 都触发，缓存可
 * 把后续调用降到 ~0ms。
 *
 * 仅按 (secret, saltHex) 缓存认为输出确定——scrypt 同输入同输出。
 *
 * P2-29: encrypt() 每次用随机 salt，每次都新增一条缓存项。长命进程上每条
 * decrypt 都新增一条（每个 provider.apiKey 用唯一 salt 加密入库），缓存无
 * 上限会单调增长（慢泄漏）。加 LRU 上限 1000 条，超出时删最旧（Map 维持
 * 插入序，删 first key 即最旧）。1000 足以覆盖单实例活跃 provider + 历史
 * decrypt 的 working set，超出后的 cache miss 只多几十 ms scrypt，不影响
 * 正确性（scrypt 是纯函数，重算结果一致）。
 */
const DERIVE_KEY_CACHE_MAX_DEFAULT = 1000;
let deriveKeyCacheMax = DERIVE_KEY_CACHE_MAX_DEFAULT;
const deriveKeyCache = new Map<string, Buffer>();

/**
 * ENCRYPTION_KEY 最小强度要求。无校验时 `"x"`、`"a"` 都会被接受，弱 key
 * 让 scrypt 的强度优势失效。要求 ≥16 字符（约 96 bit 熵下界，配合 scrypt
 * 仍显著抬高暴力成本）。低于阈值的弱 key 仍允许运行（避免破坏既有部署），
 * 但 startup warn 提示运维尽快轮换。
 */
const ENCRYPTION_KEY_MIN_LENGTH = 16;
let encryptionKeyWarned = false;

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is required. Set it before starting the server.');
  }
  // P2-29: 启动期（首次访问）校验 key 强度。只 warn 一次，避免 decrypt 热路径
  // 反复打日志。抛错会让生产起不来，故选择非致命 warn + 鼓励轮换。
  if (!encryptionKeyWarned && secret.length < ENCRYPTION_KEY_MIN_LENGTH) {
    logger.warn(
      `[security] ENCRYPTION_KEY is only ${secret.length} chars (< ${ENCRYPTION_KEY_MIN_LENGTH}). ` +
        'Use a strong key (>= 16 chars, ideally 32+ random bytes) and rotate as soon as possible.'
    );
    encryptionKeyWarned = true;
  }
  return secret;
}

function getCachedDerivedKey(secret: string, salt: Buffer): Buffer {
  // C3: 完整 sha256 digest(见文件头注释);secret 本体绝不进 cacheKey 明文
  const cacheKey = crypto
    .createHash('sha256')
    .update(secret)
    .update(salt)
    .digest('hex');
  const cached = deriveKeyCache.get(cacheKey);
  if (cached) {
    // LRU: 命中后挪到最新位置（删后重插），保证淘汰时删的是真最旧。
    deriveKeyCache.delete(cacheKey);
    deriveKeyCache.set(cacheKey, cached);
    return cached;
  }
  const derived = crypto.scryptSync(secret, salt, 32);
  deriveKeyCache.set(cacheKey, derived);
  // P2-29: 超 LRU 上限时删最旧（Map 插入序的首项）。
  if (deriveKeyCache.size > deriveKeyCacheMax) {
    const oldest = deriveKeyCache.keys().next().value;
    if (oldest !== undefined) deriveKeyCache.delete(oldest);
  }
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
 * 测试用：当前 key 缓存大小。生产代码不应依赖。
 */
export function _deriveKeyCacheSize(): number {
  return deriveKeyCache.size;
}

/**
 * 测试用：key 缓存 LRU 上限常量。生产代码不应依赖。
 */
export const _DERIVE_KEY_CACHE_MAX = DERIVE_KEY_CACHE_MAX_DEFAULT;

/**
 * 测试用：临时调整 LRU 上限（默认 1000 太大，跑 1000+ 次 scrypt 会超时）。
 * 生产代码不应调用；调用方应在测试结束时复位。
 */
export function _setDeriveKeyCacheMaxForTest(max: number): void {
  deriveKeyCacheMax = max;
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
