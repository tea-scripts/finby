import type { SupportCategory } from '@finby/shared';
import { useAuth } from './store';
import type { SupportTicketView } from './types';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export interface CreateSupportTicketInput {
  category: SupportCategory;
  subject: string;
  message: string;
}

export function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicketView> {
  return authed<SupportTicketView>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listSupportTickets(): Promise<SupportTicketView[]> {
  const res = await authed<{ tickets: SupportTicketView[] }>('/support/tickets');
  return res.tickets;
}
