/**
 * 登录页(G1 鉴权)
 * server 组件壳:解析 searchParams,渲染客户端登录表单
 */

import type { Metadata } from 'next';
import LoginForm from './login-form';

export const metadata: Metadata = {
  title: '登录 - ApiMock',
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, from } = await searchParams;

  return <LoginForm error={error} from={from} />;
}
