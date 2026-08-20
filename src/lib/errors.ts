// One error envelope everywhere: { error: { code, message, details? } }.
// Codes are part of the API contract — clients branch on `code`, not on the
// message text or the HTTP status alone.

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SLOT_TAKEN"
  | "HOLD_EXPIRED"
  | "HOLD_NOT_FOUND"
  | "DOCTOR_ON_LEAVE"
  | "LEAVE_OVERLAP"
  | "ILLEGAL_STATE_TRANSITION"
  | "LLM_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLOT_TAKEN: 409,
  HOLD_EXPIRED: 409,
  HOLD_NOT_FOUND: 404,
  DOCTOR_ON_LEAVE: 409,
  LEAVE_OVERLAP: 409,
  ILLEGAL_STATE_TRANSITION: 409,
  LLM_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}
