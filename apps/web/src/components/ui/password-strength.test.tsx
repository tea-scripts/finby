import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordStrength } from './password-strength';

describe('PasswordStrength', () => {
  it('renders nothing for an empty value', () => {
    const { container } = render(<PasswordStrength value="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Weak label for a short password', () => {
    render(<PasswordStrength value="abc" />);
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('shows the Strong label for a long, varied password', () => {
    render(<PasswordStrength value="Abcdef1!xyz2" />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });
});
