/**
 * package-standalone.mjs 的类型声明(测试 import 用)
 * 实现与注释见 scripts/package-standalone.mjs
 */
export declare const ROOT_ALLOWLIST: Set<string>;
export declare function pruneToAllowlist(dir: string): string[];
export declare function scanForbidden(dir: string, base?: string): string[];
