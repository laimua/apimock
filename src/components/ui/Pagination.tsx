'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** 条目总数(展示用) */
  total: number;
  onPageChange: (page: number) => void;
  /** 条目名称,如「项目」「条记录」 */
  itemLabel?: string;
}

/**
 * 通用分页控件:上一页/下一页 + 总数/页码摘要。
 * totalPages <= 1 时不渲染。
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  itemLabel = '条记录',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        共 {total} 个{itemLabel}，第 {page}/{totalPages} 页
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          上一页
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          下一页
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
