import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

// Ethereal is a throwaway SMTP sandbox for local dev/demo — createTestAccount
// provisions a fresh inbox with no signup and no API key. Memoized so every
// send in the process shares one inbox (and the URL only needs printing once).
let transporterPromise: Promise<Transporter> | null = null;

function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = nodemailer.createTestAccount().then((account) => {
      logger.info("ethereal test inbox created", {
        user: account.user,
        inboxUrl: "https://ethereal.email/login",
      });
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    });
  }
  return transporterPromise;
}

export class EtherealEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<SendResult> {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: "Clinic <no-reply@example.com>",
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    if (previewUrl) {
      logger.info("email sent (ethereal)", { to: message.to, subject: message.subject, previewUrl });
    }
    return { providerMessageId: info.messageId, previewUrl };
  }
}
