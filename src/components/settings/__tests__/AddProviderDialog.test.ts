/**
 * AddProviderDialog 模型列表解析单测(P1-14)。
 *
 * 受控值此前直接用 JSON.stringify(formData.models),编辑中间态恒非法 JSON
 * 致 onChange 内 try/catch 吞掉输入。改为字符串 state + parseModelsInput 校验。
 * 本测试覆盖 parseModelsInput 的归一化/校验路径。
 */

import { describe, it, expect } from 'vitest';
import { parseModelsInput } from '../AddProviderDialog';

describe('parseModelsInput', () => {
  it('合法 JSON 字符串数组 → ok + models', () => {
    expect(parseModelsInput('["gpt-4", "gpt-3.5"]')).toEqual({
      ok: true,
      models: ['gpt-4', 'gpt-3.5'],
    });
  });

  it('允许首尾空白', () => {
    expect(parseModelsInput('  ["a"]  ')).toEqual({ ok: true, models: ['a'] });
  });

  it('空串 → ok=false, error 提示不能为空', () => {
    const r = parseModelsInput('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/不能为空/);
  });

  it('纯空白 → ok=false', () => {
    const r = parseModelsInput('   ');
    expect(r.ok).toBe(false);
  });

  it('非 JSON 文本 → ok=false, 提示 JSON 格式', () => {
    const r = parseModelsInput('gpt-4, claude');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/);
  });

  it('JSON 但非数组(对象) → ok=false, 提示数组', () => {
    const r = parseModelsInput('{"a": 1}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/数组/);
  });

  it('空数组 → ok=false, 提示不能为空', () => {
    const r = parseModelsInput('[]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/不能为空/);
  });

  it('数组含非字符串元素 → ok=false, 提示元素必须为字符串', () => {
    const r = parseModelsInput('["a", 1]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/字符串/);
  });

  it('半截 JSON(编辑中间态)→ ok=false,不抛错', () => {
    // 用户敲到一半:'["gpt-4",'
    expect(() => parseModelsInput('["gpt-4",')).not.toThrow();
    const r = parseModelsInput('["gpt-4",');
    expect(r.ok).toBe(false);
  });
});
