import { formatInTimeZone } from "date-fns-tz";
import { clinicTimeZone } from "@/lib/clinic-time";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function formatWhen(date: Date): string {
  return formatInTimeZone(date, clinicTimeZone(), "EEEE, MMMM d, yyyy 'at' h:mm a zzz");
}

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 16px;">${title}</h2>
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 12px; color: #666;">This is an automated message from your clinic's appointment system.</p>
  </body>
</html>`;
}

export function bookingConfirmationEmail(params: {
  recipientName: string;
  recipientRole: "PATIENT" | "DOCTOR";
  counterpartName: string;
  specialisation: string;
  startsAt: Date;
}): EmailContent {
  const { recipientName, recipientRole, counterpartName, specialisation, startsAt } = params;
  const when = formatWhen(startsAt);
  const withWhom =
    recipientRole === "PATIENT" ? `Dr. ${counterpartName} (${specialisation})` : counterpartName;

  return {
    subject: `Appointment confirmed — ${when}`,
    text: `Hi ${recipientName},\n\nYour appointment with ${withWhom} is confirmed for ${when}.\n\nSee you then.`,
    html: wrap(
      "Appointment confirmed",
      `<p>Hi ${recipientName},</p>
       <p>Your appointment with <strong>${withWhom}</strong> is confirmed for:</p>
       <p style="font-size: 18px; font-weight: 600;">${when}</p>`
    ),
  };
}

export function bookingReminderEmail(params: {
  recipientName: string;
  recipientRole: "PATIENT" | "DOCTOR";
  counterpartName: string;
  specialisation: string;
  startsAt: Date;
}): EmailContent {
  const { recipientName, recipientRole, counterpartName, specialisation, startsAt } = params;
  const when = formatWhen(startsAt);
  const withWhom =
    recipientRole === "PATIENT" ? `Dr. ${counterpartName} (${specialisation})` : counterpartName;

  return {
    subject: `Reminder: appointment ${when}`,
    text: `Hi ${recipientName},\n\nReminder: you have an appointment with ${withWhom} on ${when}.`,
    html: wrap(
      "Upcoming appointment",
      `<p>Hi ${recipientName},</p>
       <p>Reminder — you have an appointment with <strong>${withWhom}</strong>:</p>
       <p style="font-size: 18px; font-weight: 600;">${when}</p>`
    ),
  };
}

export function bookingCancellationEmail(params: {
  recipientName: string;
  recipientRole: "PATIENT" | "DOCTOR";
  counterpartName: string;
  specialisation: string;
  startsAt: Date;
  reason: string;
  rebookingLinks?: { url: string; when: string }[];
}): EmailContent {
  const { recipientName, recipientRole, counterpartName, specialisation, startsAt, reason, rebookingLinks } =
    params;
  const when = formatWhen(startsAt);
  const withWhom =
    recipientRole === "PATIENT" ? `Dr. ${counterpartName} (${specialisation})` : counterpartName;

  const linksHtml =
    rebookingLinks && rebookingLinks.length > 0
      ? `<p>Here are three other available times:</p>
         <ul>${rebookingLinks.map((l) => `<li><a href="${l.url}">${l.when}</a></li>`).join("")}</ul>`
      : "";
  const linksText =
    rebookingLinks && rebookingLinks.length > 0
      ? `\n\nOther available times:\n${rebookingLinks.map((l) => `- ${l.when}: ${l.url}`).join("\n")}`
      : "";

  return {
    subject: `Appointment cancelled — ${when}`,
    text: `Hi ${recipientName},\n\nYour appointment with ${withWhom} on ${when} has been cancelled.\nReason: ${reason}${linksText}`,
    html: wrap(
      "Appointment cancelled",
      `<p>Hi ${recipientName},</p>
       <p>Your appointment with <strong>${withWhom}</strong> on <strong>${when}</strong> has been cancelled.</p>
       <p>Reason: ${reason}</p>
       ${linksHtml}`
    ),
  };
}

export function medicationReminderEmail(params: {
  patientName: string;
  medicationName: string;
  dosage: string;
  instructions?: string | null;
}): EmailContent {
  const { patientName, medicationName, dosage, instructions } = params;
  return {
    subject: `Medication reminder: ${medicationName}`,
    text: `Hi ${patientName},\n\nTime to take ${medicationName} (${dosage}).${
      instructions ? `\n${instructions}` : ""
    }`,
    html: wrap(
      "Medication reminder",
      `<p>Hi ${patientName},</p>
       <p>Time to take <strong>${medicationName}</strong> (${dosage}).</p>
       ${instructions ? `<p>${instructions}</p>` : ""}`
    ),
  };
}
