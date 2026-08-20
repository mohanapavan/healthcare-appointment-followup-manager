import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

export class ResendEmailProvider implements EmailProvider {
  private client: Resend;
  private from: string;

  constructor() {
    const env = getEnv();
    this.client = new Resend(env.RESEND_API_KEY);
    this.from = env.EMAIL_FROM;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
    );
    if (error || !data) {
      throw new Error(`Resend send failed: ${error?.message ?? "unknown error"}`);
    }
    return { providerMessageId: data.id };
  }
}
