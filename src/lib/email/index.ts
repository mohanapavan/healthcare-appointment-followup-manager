import { getEnv } from "@/lib/env";
import { EtherealEmailProvider } from "./ethereal";
import { ResendEmailProvider } from "./resend";
import type { EmailProvider } from "./types";

export type { EmailMessage, EmailProvider, SendResult } from "./types";

let cached: EmailProvider | null = null;

/** Picked once per process by EMAIL_PROVIDER; both implement the same interface, so callers never branch on which one is active. */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();
  cached = env.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider() : new EtherealEmailProvider();
  return cached;
}
