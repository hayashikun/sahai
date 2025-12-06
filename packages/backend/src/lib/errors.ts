import type { Context } from "hono";
import type { ErrorCode } from "../../../shared/index.js";

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

// Helper functions for common errors
export function notFound(c: Context, resource: string) {
  return c.json(createErrorResponse("NOT_FOUND", `${resource} not found`), 404);
}

export function badRequest(
  c: Context,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(createErrorResponse("BAD_REQUEST", message, details), 400);
}

export function validationError(
  c: Context,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(createErrorResponse("VALIDATION_ERROR", message, details), 400);
}

export function conflict(c: Context, message: string) {
  return c.json(createErrorResponse("CONFLICT", message), 409);
}

export function internalError(c: Context, message: string) {
  return c.json(createErrorResponse("INTERNAL_ERROR", message), 500);
}

export function invalidStateTransition(
  c: Context,
  currentState: string,
  requiredStates: string[],
  action: string,
) {
  return c.json(
    createErrorResponse(
      "INVALID_STATE_TRANSITION",
      `Cannot ${action}: task is in ${currentState} status, but must be in ${requiredStates.join(" or ")} status`,
      { currentState, requiredStates, action },
    ),
    400,
  );
}
