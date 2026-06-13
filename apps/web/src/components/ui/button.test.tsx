import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('disables itself while loading', () => {
    render(<Button loading>Send</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('keeps the label in flow while loading so the width never shifts', () => {
    // The label must stay rendered (transparent, not removed) — otherwise adding
    // the spinner changes the button's width and shifts/squeezes adjacent layout
    // (the chat composer's input). It must also stay in the a11y tree.
    render(<Button loading>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('takes the spinner out of normal flow so it adds no inline width', () => {
    const { container } = render(<Button loading>Send</Button>);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    // The spinner is absolutely positioned (overlay), never an inline sibling
    // that would widen the button.
    expect(spinner!.closest('[class*="absolute"]')).not.toBeNull();
  });

  it('renders no spinner when idle', () => {
    const { container } = render(<Button>Send</Button>);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});
