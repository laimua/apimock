import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';

// Mock next-themes
const mockSetTheme = vi.fn();
let mockResolvedTheme = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: mockSetTheme,
    resolvedTheme: mockResolvedTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedTheme = 'light';
  });

  it('does not render placeholder div after mount', () => {
    const { container } = render(<ThemeToggle />);
    // In happy-dom, useEffect fires synchronously, so mounted=true immediately
    // The placeholder is only visible during SSR before hydration
    const placeholder = container.querySelector('.w-9.h-9');
    expect(placeholder).toBeFalsy();
  });

  it('renders Moon icon in light mode after mount', () => {
    mockResolvedTheme = 'light';
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '切换到暗色模式' });
    expect(button).toBeTruthy();
  });

  it('renders Sun icon in dark mode after mount', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '切换到浅色模式' });
    expect(button).toBeTruthy();
  });

  it('calls setTheme with "dark" when clicked in light mode', () => {
    mockResolvedTheme = 'light';
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '切换到暗色模式' });
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme with "light" when clicked in dark mode', () => {
    mockResolvedTheme = 'dark';
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: '切换到浅色模式' });
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
