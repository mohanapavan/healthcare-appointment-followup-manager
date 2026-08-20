import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().min(1).default("http://localhost:3000"),
  APP_TIMEZONE: z.string().min(1).default("UTC"),
  CRON_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  EMAIL_PROVIDER: z.enum(["ethereal", "resend"]).default("ethereal"),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Clinic <no-reply@example.com>"),

  GEMINI_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gemini-1.5-flash"),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

// Parsed lazily (not at module load) so scripts can set process.env first.
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isLlmConfigured(): boolean {
  return getEnv().GEMINI_API_KEY.length > 0;
}

export function isCalendarConfigured(): boolean {
  const env = getEnv();
  return env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0;
}
