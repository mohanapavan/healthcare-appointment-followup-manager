import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";
import { AppError, errorBody } from "./errors";
import { logger, newCorrelationId } from "./logger";

export interface RequestContext {
  correlationId: string;
}

type Handler = (req: NextRequest, ctx: RequestContext) => Promise<NextResponse>;

/**
 * Wraps a route handler with: correlation-ID propagation, structured error
 * logging, and translation of thrown errors into the one error envelope
 * used across the whole API. Route handlers should throw AppError (or let
 * ZodError propagate from parseBody) rather than building responses by hand
 * for failure cases.
 */
export function withApi(handler: Handler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId =
      req.headers.get("x-correlation-id") ?? newCorrelationId();
    const ctx: RequestContext = { correlationId };
    const start = Date.now();

    try {
      const res = await handler(req, ctx);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn("request failed", {
          correlationId,
          code: err.code,
          message: err.message,
          path: req.nextUrl.pathname,
          durationMs: Date.now() - start,
        });
        const res = NextResponse.json(
          errorBody(err.code, err.message, err.details),
          { status: err.status }
        );
        res.headers.set("x-correlation-id", correlationId);
        return res;
      }

      if (err instanceof ZodError) {
        logger.warn("validation failed", {
          correlationId,
          path: req.nextUrl.pathname,
          issues: err.issues,
        });
        const res = NextResponse.json(
          errorBody("VALIDATION_ERROR", "Request failed validation", {
            issues: err.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          }),
          { status: 422 }
        );
        res.headers.set("x-correlation-id", correlationId);
        return res;
      }

      logger.error("unhandled error", {
        correlationId,
        path: req.nextUrl.pathname,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      const res = NextResponse.json(
        errorBody("INTERNAL_ERROR", "Something went wrong. Please try again."),
        { status: 500 }
      );
      res.headers.set("x-correlation-id", correlationId);
      return res;
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  });
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  return schema.parse(params);
}
