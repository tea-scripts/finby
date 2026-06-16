import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './toggle';

describe('Toggle', () => {
  it('renders a switch reflecting the checked state and toggles on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Confetti" />);
    const sw = screen.getByRole('switch', { name: 'Confetti' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
