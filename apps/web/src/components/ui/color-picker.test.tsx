import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker, ACCOUNT_COLORS } from './color-picker';

describe('ColorPicker', () => {
  it('renders a radio per palette color plus a Default option', () => {
    render(<ColorPicker value={null} onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(ACCOUNT_COLORS.length + 1);
  });

  it('marks Default as checked when value is null', () => {
    render(<ColorPicker value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
  });

  it('treats an empty-string value as Default', () => {
    render(<ColorPicker value="" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');
  });

  it('marks the swatch matching value as checked', () => {
    render(<ColorPicker value="#14b8a6" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the hex when a swatch is clicked', () => {
    const onChange = vi.fn();
    render(<ColorPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(onChange).toHaveBeenCalledWith('#1d6ef5');
  });

  it('calls onChange with null when Default is clicked', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#14b8a6" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Default' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('moves selection with arrow keys', () => {
    const onChange = vi.fn();
    render(<ColorPicker value={null} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Default' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(ACCOUNT_COLORS[0].hex);
  });
});
