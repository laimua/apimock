'use client';

import { ReactNode } from 'react';

interface OnboardingModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  primaryAction: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
  onClose?: () => void;
}

export function OnboardingModal({
  isOpen,
  title,
  description,
  primaryAction,
  secondaryAction,
  icon,
  onClose,
}: OnboardingModalProps) {
  if (!isOpen) return null;

  const defaultIcon = (
    <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full animate-scale-in">
        <div className="p-6 sm:p-8">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            {icon || defaultIcon}
          </div>

          {/* Title */}
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white text-center mb-3">
            {title}
          </h3>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 text-center text-sm sm:text-base mb-6">
            {description}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm min-h-11"
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm min-h-11"
            >
              {primaryAction.label}
            </button>
          </div>

          {/* Skip link */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              稍后再说
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
