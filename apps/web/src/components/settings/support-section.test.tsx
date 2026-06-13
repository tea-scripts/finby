import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SupportTicketView } from '@/lib/types';
import { SupportSection } from './support-section';

vi.mock('../../lib/support-api', () => ({
  createSupportTicket: vi.fn(),
  listSupportTickets: vi.fn(),
}));

import { createSupportTicket, listSupportTickets } from '../../lib/support-api';

const mockCreate = vi.mocked(createSupportTicket);
const mockList = vi.mocked(listSupportTickets);

function ticket(overrides: Partial<SupportTicketView> = {}): SupportTicketView {
  return {
    id: 't1',
    category: 'BUG',
    subject: 'App crashes',
    message: 'It crashes on login',
    status: 'OPEN',
    resolvedAt: null,
    createdAt: '2026-06-13T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('SupportSection', () => {
  it('lists the user’s existing tickets with a status label', async () => {
    mockList.mockResolvedValue([ticket({ status: 'RESOLVED' })]);
    render(<SupportSection />);
    expect(await screen.findByText('App crashes')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('submits a ticket and shows it in the list', async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(ticket({ id: 't2', subject: 'My issue', message: 'details' }));
    render(<SupportSection />);

    fireEvent.change(await screen.findByLabelText('Subject'), { target: { value: 'My issue' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'details' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        category: 'BUG',
        subject: 'My issue',
        message: 'details',
      });
    });
    expect(await screen.findByText('My issue')).toBeInTheDocument();
  });

  it('shows an error when submission fails', async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error('boom'));
    render(<SupportSection />);

    fireEvent.change(await screen.findByLabelText('Subject'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/couldn.?t send/i)).toBeInTheDocument();
  });
});
