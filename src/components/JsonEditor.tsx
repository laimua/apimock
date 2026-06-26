'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, Diagnostic } from '@codemirror/lint';
import { EditorState, Extension } from '@codemirror/state';
import { useTheme } from 'next-themes';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

// JSON linter 用于显示语法错误
const jsonLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const content = view.state.doc.toString();

  try {
    JSON.parse(content);
  } catch (e) {
    if (e instanceof SyntaxError) {
      const match = e.message.match(/position (\d+)/);
      const pos = match ? parseInt(match[1]) : 0;
      diagnostics.push({
        from: pos,
        to: pos + 1,
        severity: 'error',
        message: e.message,
      });
    }
  }

  return diagnostics;
});

// 浅色主题（与暗色 oneDark 对应）
const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#ffffff',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  '.cm-content': {
    padding: '12px',
  },
  '.cm-gutters': {
    backgroundColor: '#f9fafb',
    color: '#6b7280',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: '#f3f4f6',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f3f4f6',
    color: '#111827',
  },
  '.cm-diagnostic': {
    marginLeft: '0',
    paddingLeft: '0',
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid #ef4444',
  },
});

// 暗色主题（在 oneDark 基础上补自定义样式，保持原行为）
const darkThemeExtra = EditorView.theme({
  '&': {
    height: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  '.cm-content': {
    padding: '12px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#111827',
  },
  '.cm-diagnostic': {
    marginLeft: '0',
    paddingLeft: '0',
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid #ef4444',
  },
});

export function JsonEditor({ value, onChange, readOnly = false, height = '300px' }: JsonEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isValid, setIsValid] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (!editorRef.current) return;

    // 根据当前主题选择编辑器主题扩展
    const themeExtensions: Extension[] = isDark
      ? [oneDark, darkThemeExtra]
      : [lightTheme];

    // 创建编辑器状态
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        json(),
        ...themeExtensions,
        jsonLinter,
        EditorView.theme({
          '&': {
            height,
          },
        }),
        EditorView.lineWrapping,
        readOnly ? EditorState.readOnly.of(true) : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onChange(newValue);

            // 验证 JSON
            try {
              JSON.parse(newValue);
              setIsValid(true);
            } catch {
              setIsValid(false);
            }
          }
        }),
      ],
    });

    // 创建编辑器视图
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 主题切换时需重建编辑器以应用新主题扩展
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, height, readOnly]);

  // 当外部 value 变化时更新编辑器内容
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div className={`border rounded-lg overflow-hidden ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}>
      <div ref={editorRef} />
      {!isValid && (
        <div className="bg-red-50 text-red-700 px-4 py-2 text-sm flex items-center gap-2 border-t border-red-200">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>无效的 JSON 格式</span>
        </div>
      )}
    </div>
  );
}
