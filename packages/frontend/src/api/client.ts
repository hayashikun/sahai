import type { ErrorCode } from "shared/schemas";

// Use relative URL in production browser (when served by same server),
// absolute URL in development or non-browser environments (tests)
const isProductionBrowser =
  typeof window !== "undefined" &&
  !import.meta.env.DEV &&
  typeof document !== "undefined";

const env = typeof import.meta !== "undefined" ? import.meta.env ?? {} : {};
const API_BASE = (
  (env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:49382"
).replace(/\/$/, "");

export const API_BASE_URL = isProductionBrowser
  ? "/v1"
  : `${API_BASE}/v1`;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: {
      error?: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
    };
    try {
      errorData = await response.json();
    } catch {
      throw new ApiError(
        "INTERNAL_ERROR",
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    if (errorData.error) {
      throw new ApiError(
        errorData.error.code,
        errorData.error.message,
        response.status,
        errorData.error.details,
      );
    }

    throw new ApiError(
      "INTERNAL_ERROR",
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
    );
  }
  return response.json();
}

export async function fetcher<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await handleResponse<void>(response);
  }
}
