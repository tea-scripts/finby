import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGate } from './AuthGate';
import { useAuthStore } from '../lib/auth-store';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('AuthGate', () => {
  beforeEach(() => {
    push.mockClear();
    useAuthStore.setState({ token: null });
    window.localStorage.clear();
  });

  it('redirects to /login when there is no token', () => {
    render(<AuthGate><div>secret</div></AuthGate>);
    expect(push).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('renders children when a token exists', () => {
    useAuthStore.setState({ token: 'tok' });
    render(<AuthGate><div>secret</div></AuthGate>);
    expect(screen.getByText('secret')).toBeTruthy();
  });
});
