/**
 * EndpointForm 直接组件测试(codex 验收补测)
 *
 * 覆盖 create/edit 双模式行为差异:
 * - create: 路径输入自动补头斜杠、blur 才校验(touched 机制)、校验过后实时清错、
 *   路径模板快捷填充、Mock URL 预览、placeholder、form id="endpoint-form"
 * - edit: 路径错误 banner 由 errors prop 驱动、路径输入 onChange 直接清错、无 blur 校验
 * - 共享: tags blur 归一化(trim/去空/去重)、Content-Type 切换保模板/保用户输入
 * - 锚点/slot 模式归属: status-code-select / open-template-library / quickScenariosSlot /
 *   footerSlot 仅 edit;endpoint-form id / responseExtrasSlot / 路径模板 / placeholder 仅 create
 *
 * 一律用 userEvent 模拟真实交互,不做 snapshot 断言。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { EndpointForm, type EndpointFormErrors } from '@/components/EndpointForm';
import {
  EMPTY_ENDPOINT_FORM,
  DEFAULT_RESPONSES,
  type EndpointFormState,
} from '@/lib/endpoint-form-utils';

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// CodeMirror 在 happy-dom 跑不动,换成等价受控 textarea
vi.mock('@/components/JsonEditor', () => ({
  JsonEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="json-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// 两个对话框 isOpen=false 时不渲染内容,测试不打开它们,直接打桩
vi.mock('@/components/AiGenerateDialog', () => ({
  AiGenerateDialog: () => null,
}));
vi.mock('@/components/TemplateLibraryDialog', () => ({
  TemplateLibraryDialog: () => null,
}));

interface HarnessProps {
  mode: 'create' | 'edit';
  initialForm?: Partial<EndpointFormState>;
  initialErrors?: EndpointFormErrors;
}

/** EndpointForm 是受控组件(state 由页面持有),测试用 Harness 复刻页面的 state 持有方式 */
function Harness({ mode, initialForm, initialErrors }: HarnessProps) {
  const [form, setForm] = useState<EndpointFormState>({
    ...EMPTY_ENDPOINT_FORM,
    ...initialForm,
  });
  const [tagsInput, setTagsInput] = useState(form.tags.join(', '));
  const [errors, setErrors] = useState<EndpointFormErrors>(initialErrors ?? {});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  return (
    <EndpointForm
      mode={mode}
      form={form}
      setForm={setForm}
      tagsInput={tagsInput}
      setTagsInput={setTagsInput}
      errors={errors}
      setErrors={setErrors}
      disabled={false}
      onSubmit={(e) => e.preventDefault()}
      projectSlug="proj"
      touched={touched}
      setTouched={setTouched}
      quickScenariosSlot={<div data-testid="quick-scenarios-slot" />}
      responseExtrasSlot={<div data-testid="response-extras-slot" />}
      footerSlot={<div data-testid="footer-slot" />}
    />
  );
}

describe('EndpointForm create 模式', () => {
  it('路径输入自动补头斜杠(normalize)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    const pathInput = screen.getByLabelText(/路径/);
    await user.type(pathInput, 'api/users');

    expect(pathInput).toHaveValue('/api/users');
  });

  it('路径 blur 才校验:未触摸时不报错的,blur 后显示错误', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    const pathInput = screen.getByLabelText(/路径/);
    // ':1' → normalize 为 '/:1',路径参数格式非法
    await user.type(pathInput, ':1');
    // 未 blur(touched.path=false),不实时校验
    expect(screen.queryByText(/格式非法/)).not.toBeInTheDocument();

    await user.tab(); // blur
    expect(screen.getByText(/格式非法/)).toBeInTheDocument();
  });

  it('路径校验过后改为实时校验:修正输入立即清错,无需再 blur', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    const pathInput = screen.getByLabelText(/路径/);
    await user.type(pathInput, ':1');
    await user.tab();
    expect(screen.getByText(/格式非法/)).toBeInTheDocument();

    // 已 touched,改合法后错误实时消失
    await user.clear(pathInput);
    await user.type(pathInput, 'users');
    expect(screen.queryByText(/格式非法/)).not.toBeInTheDocument();
    expect(pathInput).toHaveValue('/users');
  });

  it('点击路径模板直接填充并清错', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    const pathInput = screen.getByLabelText(/路径/);
    await user.type(pathInput, ':1');
    await user.tab();
    expect(screen.getByText(/格式非法/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '/api/items' }));
    expect(pathInput).toHaveValue('/api/items');
    expect(screen.queryByText(/格式非法/)).not.toBeInTheDocument();
  });

  it('输入路径后展示 Mock URL 预览(create-only)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    expect(screen.queryByText(/Mock URL 预览/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/路径/), 'api/users');

    expect(screen.getByText(/Mock URL 预览/)).toBeInTheDocument();
    expect(screen.getByText(/\/proj\/api\/users/)).toBeInTheDocument();
  });

  it('create 锚点/slot:form id、placeholder、路径模板、responseExtrasSlot 在场;edit 锚点缺席', () => {
    const { container } = render(<Harness mode="create" />);

    expect(container.querySelector('form#endpoint-form')).not.toBeNull();
    expect(screen.getByPlaceholderText('获取用户列表')).toBeInTheDocument();
    expect(screen.getByText('常用路径：')).toBeInTheDocument();
    expect(screen.getByTestId('response-extras-slot')).toBeInTheDocument();

    // edit-only 锚点/slot 不出现
    expect(screen.queryByTestId('status-code-select')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-template-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-scenarios-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer-slot')).not.toBeInTheDocument();
  });
});

describe('EndpointForm edit 模式', () => {
  it('路径错误 banner 由 errors prop 驱动,输入时直接清错(无需 blur)', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        mode="edit"
        initialForm={{ path: '/api/old' }}
        initialErrors={{ path: '路径不能为空' }}
      />,
    );

    // banner 展示传入的错误
    expect(screen.getByText('路径不能为空')).toBeInTheDocument();

    // 输入即清错(edit 的 onChange 直接 setErrors path=undefined)
    const pathInput = screen.getByLabelText(/路径/);
    await user.type(pathInput, 'x');
    expect(screen.queryByText('路径不能为空')).not.toBeInTheDocument();
    expect(pathInput).toHaveValue('/api/oldx');
  });

  it('edit 路径无 blur 校验:非法值 blur 后不产生错误', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" initialForm={{ path: '/api/old' }} />);

    const pathInput = screen.getByLabelText(/路径/);
    await user.clear(pathInput);
    await user.type(pathInput, ':1');
    await user.tab();

    expect(screen.queryByText(/格式非法/)).not.toBeInTheDocument();
  });

  it('edit 锚点/slot:status-code-select、open-template-library、quickScenariosSlot、footerSlot 在场;create 锚点缺席', () => {
    const { container } = render(<Harness mode="edit" initialForm={{ path: '/api/old' }} />);

    expect(screen.getByTestId('status-code-select')).toBeInTheDocument();
    expect(screen.getByTestId('open-template-library')).toBeInTheDocument();
    expect(screen.getByTestId('quick-scenarios-slot')).toBeInTheDocument();
    expect(screen.getByTestId('footer-slot')).toBeInTheDocument();
    expect(screen.getByText('基本信息')).toBeInTheDocument();

    // create-only 锚点/slot 不出现
    expect(container.querySelector('form#endpoint-form')).toBeNull();
    expect(screen.queryByPlaceholderText('获取用户列表')).not.toBeInTheDocument();
    expect(screen.queryByText('常用路径：')).not.toBeInTheDocument();
    expect(screen.queryByTestId('response-extras-slot')).not.toBeInTheDocument();
  });

  it('tags blur 归一化:trim、去空、去重后落回输入框', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" initialForm={{ path: '/api/old' }} />);

    const tagsInput = screen.getByLabelText('标签');
    await user.type(tagsInput, ' 用户 , 列表,用户,,');
    await user.tab();

    expect(tagsInput).toHaveValue('用户, 列表');
  });
});

describe('EndpointForm Content-Type 切换(两模式共享,以 create 验证)', () => {
  it('body 仍是当前类型默认模板时,切换 Content-Type 替换为新模板', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    // 初始 json 默认模板经 JsonEditor(textarea 桩)展示
    expect(screen.getByTestId('json-editor')).toHaveValue(
      DEFAULT_RESPONSES['application/json'],
    );

    await user.selectOptions(screen.getByLabelText('Content-Type'), 'text/plain');

    // 切到非 json 后渲染普通 textarea,body 已换成 text/plain 模板
    expect(screen.getByLabelText('响应数据')).toBeInTheDocument();
    expect(document.getElementById('endpoint-response-body')).toHaveValue('Success');
  });

  it('body 被用户改过后,切换 Content-Type 保留用户输入', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" />);

    const editor = screen.getByTestId('json-editor');
    await user.clear(editor);
    await user.type(editor, 'user custom body');

    await user.selectOptions(screen.getByLabelText('Content-Type'), 'text/plain');

    expect(document.getElementById('endpoint-response-body')).toHaveValue('user custom body');
  });
});
