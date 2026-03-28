interface BadgeProps {
  method: string;
  className?: string;
}

const colors: Record<string, string> = {
  GET: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  POST: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  PUT: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  DELETE: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  PATCH: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  HEAD: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  OPTIONS: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
};

export function Badge({ method, className = '' }: BadgeProps) {
  const colorClass = colors[method] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';

  return (
    <span
      className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-mono font-semibold ${colorClass} ${className}`}
    >
      {method}
    </span>
  );
}
