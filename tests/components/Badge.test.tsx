import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('should render GET method with green color', () => {
    render(<Badge method="GET" />);

    const badge = screen.getByText('GET');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-100');
  });

  it('should render POST method with blue color', () => {
    render(<Badge method="POST" />);

    const badge = screen.getByText('POST');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-100');
  });

  it('should render PUT method with yellow color', () => {
    render(<Badge method="PUT" />);

    const badge = screen.getByText('PUT');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-yellow-100');
  });

  it('should render DELETE method with red color', () => {
    render(<Badge method="DELETE" />);

    const badge = screen.getByText('DELETE');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100');
  });

  it('should render PATCH method with purple color', () => {
    render(<Badge method="PATCH" />);

    const badge = screen.getByText('PATCH');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-purple-100');
  });

  it('should render HEAD method with gray color', () => {
    render(<Badge method="HEAD" />);

    const badge = screen.getByText('HEAD');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100');
  });

  it('should render OPTIONS method with gray color', () => {
    render(<Badge method="OPTIONS" />);

    const badge = screen.getByText('OPTIONS');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100');
  });

  it('should render unknown method with gray color', () => {
    render(<Badge method="UNKNOWN" />);

    const badge = screen.getByText('UNKNOWN');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100');
  });

  it('should apply custom className', () => {
    render(<Badge method="GET" className="custom-class" />);

    const badge = screen.getByText('GET');
    expect(badge).toHaveClass('custom-class');
  });

  it('should have inline-flex items-center class', () => {
    render(<Badge method="GET" />);

    const badge = screen.getByText('GET');
    expect(badge).toHaveClass('inline-flex', 'items-center');
  });
});
