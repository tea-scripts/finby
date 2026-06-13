import type { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from './dto/support.schemas';

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export interface SupportTicketView {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  resolvedAt: string | null;
  createdAt: string;
}

/** Admin-facing view: includes the submitter for triage. */
export interface AdminSupportTicketView extends SupportTicketView {
  user: { email: string; displayName: string };
}
