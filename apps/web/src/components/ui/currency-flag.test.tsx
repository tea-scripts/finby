import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencyFlag } from './currency-flag';

describe('CurrencyFlag', () => {
  it('renders the mapped circle-flag image for a known currency', () => {
    const { container } = render(<CurrencyFlag currency="USD" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/flags/us.svg');
  });

  it('falls back to the currency symbol when the flag image fails to load', () => {
    const { container } = render(<CurrencyFlag currency="USD" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('falls back to the code for an unmapped currency', () => {
    const { container } = render(<CurrencyFlag currency="XAF" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('XAF')).toBeInTheDocument();
  });

  it('recovers to a flag image when the currency changes after a load error', () => {
    const { container, rerender } = render(<CurrencyFlag currency="USD" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull(); // fell back for USD

    rerender(<CurrencyFlag currency="EUR" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/flags/eu.svg');
  });
});
