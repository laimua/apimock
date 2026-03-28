'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectsApi, ApiError } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { OnboardingModal } from '@/components/ui/OnboardingModal';

interface FormErrors {
  name?: string;
  slug?: string;
  description?: string;
}

type SlugValidationStatus = 'idle' | 'loading' | 'available' | 'exists' | 'error';

export default function NewProjectPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
  });

  // Slug 校验状态
  const [slugStatus, setSlugStatus] = useState<SlugValidationStatus>('idle');
  const slugValidationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 引导弹窗状态
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // 生成 slug
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // 实时验证名称
  function validateName(name: string): string | undefined {
    if (!name.trim()) {
      return '项目名称不能为空';
    }
    if (name.trim().length < 2) {
      return '项目名称至少需要 2 个字符';
    }
    if (name.trim().length > 100) {
      return '项目名称不能超过 100 个字符';
    }
    return undefined;
  }

  // 验证 slug 格式
  function validateSlug(slug: string): string | undefined {
    if (!slug.trim()) {
      return 'Slug 不能为空';
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return 'Slug 只能包含小写字母、数字和连字符';
    }
    if (slug.length > 100) {
      return 'Slug 不能超过 100 个字符';
    }
    return undefined;
  }

  // 检查 slug 唯一性（防抖）
  const checkSlugAvailability = useCallback(async (slug: string) => {
    // 清除之前的定时器
    if (slugValidationTimerRef.current) {
      clearTimeout(slugValidationTimerRef.current);
    }

    // 如果 slug 为空，重置状态
    if (!slug.trim()) {
      setSlugStatus('idle');
      return;
    }

    // 先检查格式
    const formatError = validateSlug(slug);
    if (formatError) {
      setSlugStatus('error');
      return;
    }

    // 设置加载状态
    setSlugStatus('loading');

    // 防抖：500ms 后执行检查
    slugValidationTimerRef.current = setTimeout(async () => {
      try {
        const result = await projectsApi.checkSlug(slug);
        setSlugStatus(result.available ? 'available' : 'exists');
      } catch {
        setSlugStatus('error');
      }
    }, 500);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (slugValidationTimerRef.current) {
        clearTimeout(slugValidationTimerRef.current);
      }
    };
  }, []);

  function handleNameChange(name: string) {
    const newForm = { ...form, name };
    setForm(newForm);

    // 自动生成 slug
    const generatedSlug = generateSlug(name);
    newForm.slug = generatedSlug;
    setForm(newForm);

    // 实时验证（如果已经触摸过该字段）
    if (touched.name) {
      setErrors((prev) => ({
        ...prev,
        name: validateName(name),
      }));
    }

    // 检查 slug 可用性
    checkSlugAvailability(generatedSlug);
  }

  function handleSlugChange(slug: string) {
    const normalizedSlug = generateSlug(slug);
    setForm((prev) => ({ ...prev, slug: normalizedSlug }));

    // 实时验证（如果已经触摸过该字段）
    if (touched.slug) {
      setErrors((prev) => ({
        ...prev,
        slug: validateSlug(normalizedSlug),
      }));
    }

    // 检查 slug 可用性
    checkSlugAvailability(normalizedSlug);
  }

  function handleBlur(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));

    if (field === 'name') {
      setErrors((prev) => ({
        ...prev,
        name: validateName(form.name),
      }));
    } else if (field === 'slug') {
      setErrors((prev) => ({
        ...prev,
        slug: validateSlug(form.slug),
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 标记所有字段为已触摸
    setTouched({ name: true, slug: true, description: true });

    // 验证所有字段
    const nameError = validateName(form.name);
    const slugError = validateSlug(form.slug);
    const newErrors: FormErrors = {
      name: nameError,
      slug: slugError,
    };

    setErrors(newErrors);

    if (nameError || slugError) {
      return;
    }

    // 检查 slug 是否可用
    if (slugStatus !== 'available' && slugStatus !== 'idle') {
      toastError(slugStatus === 'exists' ? '该 Slug 已被使用' : '请等待 Slug 验证完成');
      return;
    }

    try {
      setLoading(true);

      const project = await projectsApi.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });

      // 保存项目 ID 并显示引导弹窗
      setCreatedProjectId(project.id);
      setShowOnboarding(true);
      success('项目创建成功！');
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

  // 检查是否可以提交
  const canSubmit =
    !loading &&
    form.name.trim() &&
    form.slug.trim() &&
    !errors.name &&
    !errors.slug &&
    slugStatus !== 'exists' &&
    slugStatus !== 'loading';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center">
            <Link href="/projects" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
              ← 项目列表
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">新建项目</h1>

        <Card>
          <form onSubmit={handleSubmit}>
            <CardBody className="space-y-6">
              {/* 项目名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => handleBlur('name')}
                    className={`w-full px-4 py-2 pr-10 border rounded-lg transition-colors text-gray-900 dark:text-gray-100 ${
                      errors.name
                        ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="我的 API 项目"
                    disabled={loading}
                  />
                  {errors.name && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Slug <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="flex items-center border rounded-lg overflow-hidden transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800">
                    <span className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-700 border-r border-gray-300 dark:border-gray-600">
                      /project/
                    </span>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      onBlur={() => handleBlur('slug')}
                      className={`flex-1 px-4 py-2 focus:outline-none focus:ring-2 ${
                        errors.slug || slugStatus === 'exists'
                          ? 'focus:ring-red-500'
                          : 'focus:ring-blue-500'
                      }`}
                      placeholder="my-api-project"
                      disabled={loading}
                    />
                    {/* 校验状态图标 */}
                    <div className="px-3 py-2">
                      {slugStatus === 'loading' && (
                        <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {slugStatus === 'available' && (
                        <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      {slugStatus === 'exists' && (
                        <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
                {/* 校验状态提示 */}
                {slugStatus === 'loading' && form.slug && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    检查 Slug 可用性...
                  </p>
                )}
                {slugStatus === 'available' && form.slug && (
                  <p className="mt-1 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    此 Slug 可用
                  </p>
                )}
                {slugStatus === 'exists' && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    此 Slug 已被使用，请更换
                  </p>
                )}
                {errors.slug && slugStatus !== 'exists' && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.slug}
                  </p>
                )}
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  描述
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  onBlur={() => handleBlur('description')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none text-gray-900 dark:text-gray-100"
                  rows={3}
                  placeholder="项目描述（可选）"
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {form.description.length}/500 字符
                </p>
              </div>
            </CardBody>

            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex justify-end gap-3">
              <Link href="/projects">
                <Button type="button" variant="secondary" disabled={loading}>
                  取消
                </Button>
              </Link>
              <Button type="submit" disabled={!canSubmit}>
                {loading ? '创建中...' : '创建项目'}
              </Button>
            </div>
          </form>
        </Card>
      </main>

      {/* 项目创建成功引导弹窗 */}
      <OnboardingModal
        isOpen={showOnboarding}
        title="项目创建成功！"
        description="现在可以添加你的第一个 Mock 端点，或导入 OpenAPI 文档快速开始。"
        primaryAction={{
          label: '添加端点',
          onClick: () => {
            setShowOnboarding(false);
            if (createdProjectId) {
              router.push(`/projects/${createdProjectId}/endpoints/new`);
            }
          },
        }}
        secondaryAction={{
          label: '导入 OpenAPI',
          onClick: () => {
            setShowOnboarding(false);
            if (createdProjectId) {
              router.push(`/projects/${createdProjectId}`);
            }
          },
        }}
        icon={
          <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        onClose={() => {
          setShowOnboarding(false);
          if (createdProjectId) {
            router.push(`/projects/${createdProjectId}`);
          }
        }}
      />
    </div>
  );
}
