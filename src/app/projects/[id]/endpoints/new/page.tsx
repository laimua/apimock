'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { endpointsApi, projectsApi, ApiError, Project } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { splitTags as normalizeTags } from '@/lib/utils';
import { setDirty, clearDirty } from '@/lib/unsaved-changes';
import { ErrorScenariosSelector } from '@/components/ErrorScenariosSelector';
import { EndpointForm, type EndpointFormErrors } from '@/components/EndpointForm';
import { applyErrorScenario, type ErrorScenario } from '@/lib/error-scenarios';
// C1b/C1c: 表单状态类型/初始值/校验与 EndpointForm 组件共享(原页内私有实现已下沉)
import {
  DEFAULT_RESPONSES,
  EMPTY_ENDPOINT_FORM,
  validatePath,
  type EndpointFormState,
} from '@/lib/endpoint-form-utils';

export default function NewEndpointPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { success, error: toastError } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<EndpointFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<EndpointFormState>({ ...EMPTY_ENDPOINT_FORM });
  // 标签输入框临时字符串 state:输入期保留尾逗号,blur/submit 才归一化到 form.tags
  const [tagsInput, setTagsInput] = useState('');
  // 本组件实例在全局未保存修改注册表里的唯一 id,供 GlobalHeader 导航前询问
  const dirtyIdRef = useRef(`endpoint-new-${projectId}-${Math.random().toString(36).slice(2)}`);

  // 是否有未保存修改:任意字段偏离初始空表单即视为 dirty(tagsInput 也算)
  const isDirty =
    form.path.trim() !== '' ||
    form.name.trim() !== '' ||
    form.description.trim() !== '' ||
    form.method !== 'GET' ||
    form.statusCode !== 200 ||
    form.contentType !== 'application/json' ||
    form.delayMs !== 0 ||
    !form.isShareable ||
    form.responseBody !== DEFAULT_RESPONSES['application/json'] ||
    tagsInput.trim() !== '';

  // 浏览器关闭/刷新警告(P1-16:新建端点页此前完全无防护)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // isDirty 同步到全局注册表,供 GlobalHeader 客户端导航前询问
  useEffect(() => {
    const dirtyId = dirtyIdRef.current;
    if (isDirty) {
      setDirty(dirtyId);
    } else {
      clearDirty(dirtyId);
    }
    return () => clearDirty(dirtyId);
  }, [isDirty]);

  useEffect(() => {
    loadProject();
    // 仅按 projectId 变化重载；loadProject 闭包读取最新 prop，无需加入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadProject() {
    try {
      setLoadingProject(true);
      const project = await projectsApi.get(projectId);
      setProject(project);
    } catch {
      // 兜底：找不到项目设为 null，避免 loadingProject 停在 true 卡死页面
      setProject(null);
    } finally {
      setLoadingProject(false);
    }
  }

  // 应用错误场景
  const handleApplyErrorScenario = (scenario: ErrorScenario) => {
    const applied = applyErrorScenario(scenario);
    setForm((prev) => ({
      ...prev,
      statusCode: applied.statusCode,
      contentType: applied.contentType,
      delayMs: applied.delayMs,
      responseBody: applied.responseBody,
    }));
    success(`已应用错误场景: ${scenario.name}`);
  };

  // 验证 JSON
  function validateJson(json: string): boolean {
    if (form.contentType !== 'application/json') return true;
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }

  // 校验并组装提交载荷;非法时写 errors 并返回 null
  function buildPayload() {
    // 验证所有字段
    const pathError = validatePath(form.path);
    const newErrors: EndpointFormErrors = {
      path: pathError,
    };

    // 验证 JSON（如果是 application/json）
    if (form.contentType === 'application/json' && !validateJson(form.responseBody)) {
      newErrors.responseBody = '无效的 JSON 格式';
    }

    setErrors(newErrors);

    if (pathError || newErrors.responseBody) {
      return null;
    }

    // 解析响应体
    let parsedBody: unknown = form.responseBody;
    if (form.contentType === 'application/json') {
      parsedBody = JSON.parse(form.responseBody);
    }

    // 提交前再归一化一次 tags,避免用户改完未 blur 直接提交丢失最新输入
    const submittedTags = normalizeTags(tagsInput);

    return {
      path: form.path,
      method: form.method,
      name: form.name.trim() || undefined,
      description: form.description.trim() || undefined,
      delayMs: form.delayMs || undefined,
      statusCode: form.statusCode,
      contentType: form.contentType,
      responseBody: parsedBody,
      tags: submittedTags,
      isShareable: form.isShareable,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 标记所有字段为已触摸
    setTouched({ path: true });

    const payload = buildPayload();
    if (!payload) return;

    try {
      setLoading(true);

      await endpointsApi.create(projectId, payload);

      success('端点创建成功！');
      router.push(`/projects/${projectId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('创建失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }

  // 创建并继续
  async function handleSubmitAndContinue(e: React.MouseEvent) {
    e.preventDefault();

    const payload = buildPayload();
    if (!payload) return;

    try {
      setLoading(true);

      await endpointsApi.create(projectId, payload);

      success('端点创建成功！');

      // 清空表单，继续添加
      setForm({ ...EMPTY_ENDPOINT_FORM });
      setTagsInput('');
      setErrors({});
      setTouched({});
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('创建失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  // FE20:项目加载失败(404/网络错)时,不渲染表单,避免用户填完提交才报错
  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 dark:text-gray-400 mb-4">项目不存在或加载失败</div>
          <Link href="/projects" className="text-blue-600 dark:text-blue-400 hover:underline">返回项目列表</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Breadcrumb items={[
          { label: '首页', href: '/' },
          { label: '项目列表', href: '/projects' },
          { label: project?.name || '项目', href: `/projects/${projectId}` },
          { label: '添加端点' },
        ]} />

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">添加端点</h1>

        <div className="max-w-2xl">
        {/* C1c: 两张表单卡片(基本信息 + 响应配置)由 EndpointForm 承载,与编辑页共享 */}
        <EndpointForm
          mode="create"
          form={form}
          setForm={setForm}
          tagsInput={tagsInput}
          setTagsInput={setTagsInput}
          errors={errors}
          setErrors={setErrors}
          touched={touched}
          setTouched={setTouched}
          disabled={loading}
          projectSlug={project.slug}
          onSubmit={handleSubmit}
          responseExtrasSlot={
            <ErrorScenariosSelector onApply={handleApplyErrorScenario} disabled={loading} />
          }
        />
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Link href={`/projects/${projectId}`} className="w-full sm:w-auto">
            <Button type="button" variant="secondary" disabled={loading} className="w-full sm:w-auto min-h-11">
              取消
            </Button>
          </Link>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={handleSubmitAndContinue}
            className="w-full sm:w-auto min-h-11"
          >
            {loading ? '创建中...' : '创建并继续'}
          </Button>
          <Button type="submit" form="endpoint-form" disabled={loading} className="w-full sm:w-auto min-h-11">
            {loading ? '创建中...' : '创建'}
          </Button>
        </div>
      </main>
    </div>
  );
}
