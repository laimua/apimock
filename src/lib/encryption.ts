/**
 * AES-256-GCM 加密工具
 * 用于加密存储 API Key 等敏感信息
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32bytes!';

/**
 * 加密文本
 * @param text 待加密的文本
 * @returns 加密后的字符串 (格式: iv:authTag:encrypted)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密文本
 * @param encryptedData 加密的字符串
 * @returns 解密后的原文
 * @throws 如果解密失败
 */
export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(KEY, 'salt', 32);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  try {
    decrypted += decipher.final('utf8');
  } catch (err) {
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
