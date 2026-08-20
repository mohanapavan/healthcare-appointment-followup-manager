// Minimal structured logger. Every line is one JSON object so it can be
// grepped/aggregated by correlationId to trace one booking end to end
// (request -> service -> outbox row -> LLM call).

type Level = "debug" | "info" | "warn" | "error";

interface LogFields {
  correlationId?: string;
  [key: string]: unknown;
}

function write(level: Level, message: string, fields?: LogFields) {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
