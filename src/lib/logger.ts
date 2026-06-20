/**
 * 结构化日志（pino）
 *
 * 单行 JSON 输出，async-safe。Railway / Docker / ELK / Loki 直接摄取。
 *
 * 用法：
 *   import { logger } from '@/lib/logger';
 *   logger.info({ route, ip, latencyMs }, 'mock request');
 *   logger.error({ err }, 'AI generate failed');
 *
 * 字段约定：第一参数永远是 { context 对象 }，第二参数是 human message。
 */

import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  base: { service: 'apimock' },
  redact: {
    paths: [
      'err.config.apiKey',
      'err.config.baseURL',
      '*.apiKey',
      '*.api_key',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
});

export type Logger = typeof logger;
