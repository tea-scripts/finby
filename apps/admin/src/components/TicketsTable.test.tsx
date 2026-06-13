import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminSupportTicket } from '@finby/shared';
import { TicketsTable } from './TicketsTable';
import { api } from '../lib/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/tickets' }));

vi.mock('../lib/api', () => ({
  api: { tickets: vi.fn(), updateTicket: vi.fn() },
}));

const mockTickets = vi.mocked(api.tickets);
const mockUpdate = vi.mocked(api.updateTicket);

function ticket(overrides: Partial<AdminSupportTicket> = {}): AdminSupportTicket {
  return {
    id: 't1',
    category: 'BUG',
    subject: 'App crashes',
    message: 'It crashes on login',
    status: 'OPEN',
    resolvedAt: null,
    createdAt: '2026-06-13T10:00:00.000Z',
    user: { email: 'user@finby.app', displayName: 'Aisha' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTickets.mockResolvedValue({ tickets: [] });
});

describe('TicketsTable', () => {
  it('renders tickets with submitter and subject', async () => {
    mockTickets.mockResolvedValue({ tickets: [ticket()] });
    render(<TicketsTable />);
    expect(await screen.findByText('App crashes')).toBeInTheDocument();
    expect(screen.getByText('user@finby.app')).toBeInTheDocument();
  });

  it('updates a ticket status via the row dropdown', async () => {
    mockTickets.mockResolvedValue({ tickets: [ticket()] });
    mockUpdate.mockResolvedValue(ticket({ status: 'RESOLVED', resolvedAt: '2026-06-14T00:00:00.000Z' }));
    render(<TicketsTable />);
    await screen.findByText('App crashes');

    fireEvent.click(screen.getByRole('button', { name: /status for App crashes/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Resolved' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('t1', 'RESOLVED');
    });
  });
});
