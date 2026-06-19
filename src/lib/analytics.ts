/**
 * Plausible Analytics 客户端 helper
 *
 * 配置：环境变量 NEXT_PUBLIC_PLAUSIBLE_DOMAIN（demo 域名，如 demo.apimock.io）
 * 不设则全部 no-op（dev 环境 / 未配置时静默）
 *
 * PII 守卫：
 *   - 仅接受 primitive prop 值（string/number/boolean）
 *   - 调用方责任：不传 mock 数据内容、用户输入、API key
 *   - 只传 metadata（slug、method、status、provider name 等）
 *
 * 事件清单见 ~/.gstack/projects/laimua-apimock/ceo-plans/2026-06-13-stability-launch.md
 */

type PlausibleProps = Record<string, string | number | boolean>;

interface PlausibleWindow extends Window {
  plausible?: (event: string, options?: { props?: PlausibleProps }) => void;
}

/**
 * 触发自定义事件
 * server-side / 未配置 / plausible 未加载 = no-op
 */
export function trackEvent(name: string, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return;

  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return;

  const w = window as PlausibleWindow;
  if (typeof w.plausible !== 'function') return;

  if (props && Object.keys(props).length > 0) {
    w.plausible(name, { props });
  } else {
    w.plausible(name);
  }
}

/**
 * 标准事件名（防止 typo）
 */
export const ANALYTICS_EVENTS = {
  MOCK_ENDPOINT_VIEW: 'mock_endpoint_view',
  PROJECT_CREATED: 'project_created',
  AI_GENERATE_CALLED: 'ai_generate_called',
  SHARE_LINK_CLICK: 'share_link_click',
  GITHUB_STAR_CLICK: 'github_star_click',
  LANGUAGE_TOGGLE: 'language_toggle',
} as const;
