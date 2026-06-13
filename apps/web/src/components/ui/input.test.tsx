import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('adds appearance-none when type="date"', () => {
    const { container } = render(<Input type="date" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('appearance-none');
  });

  it('does not add appearance-none when type="text"', () => {
    const { container } = render(<Input type="text" />);
    const input = container.querySelector('input');
    expect(input?.className).not.toContain('appearance-none');
  });

  it('does not add appearance-none when no type is provided', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');
    expect(input?.className).not.toContain('appearance-none');
  });

  it('merges className alongside appearance-none for type="date"', () => {
    const { container } = render(<Input type="date" className="extra" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('appearance-none');
    expect(input?.className).toContain('extra');
  });

  it('still sets type="date" on the element', () => {
    const { container } = render(<Input type="date" />);
    const input = container.querySelector('input');
    expect(input?.getAttribute('type')).toBe('date');
  });

  it('renders at >=16px on mobile (text-base) so iOS does not zoom on focus', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('input')?.className).toContain('text-base');
  });
});
