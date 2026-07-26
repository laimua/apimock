/**
 * 全局未保存修改注册表测试(P1-16)。
 *
 * GlobalHeader 走 Next 客户端路由会绕过各页 beforeunload,本注册表让编辑页
 * 注册 dirty,GlobalHeader 导航前询问。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  setDirty,
  clearDirty,
  hasUnsavedChanges,
  confirmLeaveIfDirty,
  __resetUnsavedChangesForTest,
} from '../unsaved-changes';

describe('unsaved-changes 注册表', () => {
  beforeEach(() => {
    __resetUnsavedChangesForTest();
  });

  it('初始状态无未保存修改', () => {
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('setDirty 后 hasUnsavedChanges 为 true', () => {
    setDirty('page-a');
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('clearDirty 单个实例', () => {
    setDirty('page-a');
    clearDirty('page-a');
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('多实例共存,只清一个不影响其余', () => {
    setDirty('a');
    setDirty('b');
    expect(hasUnsavedChanges()).toBe(true);
    clearDirty('a');
    expect(hasUnsavedChanges()).toBe(true);
    clearDirty('b');
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('clearDirty 未注册的 id 无副作用', () => {
    setDirty('a');
    clearDirty('not-exist');
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('setDirty 同一 id 多次注册幂等', () => {
    setDirty('a');
    setDirty('a');
    clearDirty('a');
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe('confirmLeaveIfDirty', () => {
  beforeEach(() => {
    __resetUnsavedChangesForTest();
    // happy-dom 无 window.confirm,提供默认实现,各用例再 spy 覆盖
    window.confirm = () => true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无未保存修改时返回 false(不阻止导航),且不弹 confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    expect(confirmLeaveIfDirty()).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('有未保存修改 + 用户点"确定"(confirm=true)→ 返回 false(放行导航)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setDirty('a');
    expect(confirmLeaveIfDirty()).toBe(false);
  });

  it('有未保存修改 + 用户点"取消"(confirm=false)→ 返回 true(阻止导航)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setDirty('a');
    expect(confirmLeaveIfDirty()).toBe(true);
  });

  it('自定义 message 透传给 confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setDirty('a');
    confirmLeaveIfDirty('要丢数据吗?');
    expect(confirmSpy).toHaveBeenCalledWith('要丢数据吗?');
  });
});
