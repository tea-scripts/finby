import type { SupportCategory, SupportTicketView } from '@finby/shared';
import type { AuthedFetch } from './contract';

export interface CreateSupportTicketInput {
  category: SupportCategory;
  subject: string;
  message: string;
}

export interface SupportApi {
  createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicketView>;
  listSupportTickets(): Promise<SupportTicketView[]>;
}

export function createSupportApi(authed: AuthedFetch): SupportApi {
  return {
    createSupportTicket(input) {
      return authed<SupportTicketView>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listSupportTickets() {
      const res = await authed<{ tickets: SupportTicketView[] }>('/support/tickets');
      return res.tickets;
    },
  };
}
