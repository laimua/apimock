import type { NextConfig } from "next";

// Plausible 域名（可选，留空则不加 CSP 例外）
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_SCRIPT_SRC = PLAUSIBLE_DOMAIN ? ' https://plausible.io' : '';
const PLAUSIBLE_CONNECT_SRC = PLAUSIBLE_DOMAIN ? ' https://plausible.io' : '';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'wasm-unsafe-eval'：CodeMirror 6 / 部分 JS 引擎需要
      // 'unsafe-inline'：Next.js 内联 hydration script
      // 'unsafe-eval'：dev 工具 + 某些库 eval
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'${PLAUSIBLE_SCRIPT_SRC}`,
      "style-src 'self' 'unsafe-inline'",
      // img-src 放开 https:：mock 数据含 dicebear / 外部头像
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // worker-src blob:：CodeMirror / 某些库用 blob worker
      "worker-src 'self' blob:",
      // connect-src 'self' https:：fetch 外部 API（mock 数据生成 + Plausible）
      `connect-src 'self' https:${PLAUSIBLE_CONNECT_SRC}`,
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
