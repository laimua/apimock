/**
 * 全局错误边界(P2-53)。
 *
 * Next.js 在 RootLayout 自身抛错时替换整个 RootLayout 渲染本文件,因此必须自带
 * <html>/<body>,且不依赖任何 Provider(Toast/Theme 等此时都挂了)。
 * 是 error.tsx 之上的最后一道兜底。
 */

'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
          color: '#111827',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            background: '#ffffff',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '3rem',
              height: '3rem',
              margin: '0 auto 1rem',
              borderRadius: '9999px',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
              fontSize: '1.5rem',
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            应用发生严重错误
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: '0 0 1.5rem' }}>
            页面框架加载失败,请尝试重试;如持续出现,请联系管理员。
          </p>
          {error?.message && (
            <p
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                margin: '0 0 1.5rem',
                fontFamily: 'ui-monospace, monospace',
                wordBreak: 'break-all',
              }}
            >
              {error.message}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
