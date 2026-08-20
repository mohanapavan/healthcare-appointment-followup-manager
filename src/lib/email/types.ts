export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Passed to the provider for provider-side dedup on retry, where supported. */
  idempotencyKey?: string;
}

export interface SendResult {
  providerMessageId: string;
  /** Set by the Ethereal provider only — a link to view the sent email. */
  previewUrl?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}
