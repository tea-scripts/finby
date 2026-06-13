import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders a <textarea> with the given value and aria-label', () => {
    render(<Textarea aria-label="Message" value="hi" onChange={() => {}} />);
    const el = screen.getByLabelText('Message');
    expect(el.tagName).toBe('TEXTAREA');
    expect(el).toHaveValue('hi');
  });

  it('merges a custom className', () => {
    const { container } = render(<Textarea className="extra" />);
    expect(container.querySelector('textarea')?.className).toContain('extra');
  });
});
