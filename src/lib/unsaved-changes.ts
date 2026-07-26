/**
 * 全局"未保存修改"离开防护注册表。
 *
 * 背景:GlobalHeader 在 RootLayout 全局渲染,其导航 Link 走 Next 客户端路由,
 * 不会触发各页面的 beforeunload 或局部 navigate guard。端点编辑/新建页如果
 * 把"有未保存改动"只挂在自家面包屑/取消按钮上,用户点顶栏 Projects/AI Settings/
 * New Project 等链接就会绕过 guard 丢失数据。
 *
 * 设计:模块级单例 Set 存放当前已注册的"dirty"标记 id,各编辑页 mount/dirty
 * 时调用 setDirty,unmount/clean 时 clear。GlobalHeader 在点击自家链接前调用
 * hasUnsaved() 询问;有则弹原生 confirm(组件树外,无 React Dialog 上下文)。
 *
 * 选 confirm() 而非自定义 Dialog:GlobalHeader 是 layout 级组件,自行维护
 * confirm Dialog 会与各页面的 ConfirmDialog 视觉不一致;confirm() 简单、
 * 可测、且与 beforeunload 浏览器原生提示语义对齐。
 */

const dirtyIds = new Set<string>();

/** 标记某个页面实例有未保存修改。返回传入的 id,便于对称清理。 */
export function setDirty(id: string): string {
  dirtyIds.add(id);
  return id;
}

/** 清除某个页面实例的 dirty 标记(已保存/放弃修改时调用)。 */
export function clearDirty(id: string): void {
  dirtyIds.delete(id);
}

/** 是否存在任意未保存修改。GlobalHeader 导航前询问。 */
export function hasUnsavedChanges(): boolean {
  return dirtyIds.size > 0;
}

/**
 * 若存在未保存修改,弹原生确认;用户取消返回 true(应阻止导航),否则 false。
 * 仅供 GlobalHeader 这类 layout 级组件在 onClick 里同步调用。
 */
export function confirmLeaveIfDirty(message = '有未保存的修改，确定要离开吗？'): boolean {
  if (!hasUnsavedChanges()) return false;
  // confirm 返回 false 表示用户点了"取消",即要阻止导航
  return !window.confirm(message);
}

/** 仅测试用:清空全部 dirty 标记,避免用例间串扰。 */
export function __resetUnsavedChangesForTest(): void {
  dirtyIds.clear();
}
