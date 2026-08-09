import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // standalone 打包会把 src/tests 拷进 .next/standalone 和 release/(构建产物随时再生),
    // 不排除则同一批测试跑两遍、测试数虚高;release 内 node_modules 的第三方包
    // 自带测试(pino 等)也会被扫到。覆盖 exclude 时必须带上 configDefaults 并加 ** 前缀。
    exclude: [...configDefaults.exclude, '**/.next/**', 'release/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/app/', '**/*.test.ts', '**/*.test.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
