export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Provider-agnostic transactional email port. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
