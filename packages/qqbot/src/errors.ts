import {
  AdapterError,
  AdapterRateLimitError,
  AuthenticationError,
  NetworkError,
  PermissionError,
  ResourceNotFoundError,
  ValidationError,
} from "@chat-adapter/shared";

import type { QQBotApiErrorBody } from "./types";

/** Chat SDK adapter slug used in thread IDs, logs, and shared errors. */
export const ADAPTER_NAME = "qqbot";

/** Create a QQBot-scoped validation error. */
export function validationError(message: string): ValidationError {
  return new ValidationError(ADAPTER_NAME, message);
}

/** Create a QQBot-scoped authentication error. */
export function authError(message: string): AuthenticationError {
  return new AuthenticationError(ADAPTER_NAME, message);
}

/** Map QQBot HTTP status and error body into shared Chat SDK adapter errors. */
export function mapQQBotError(
  status: number,
  body: QQBotApiErrorBody | string | undefined,
): AdapterError {
  const message =
    typeof body === "string"
      ? body
      : (body?.message ?? `QQBot API request failed with status ${status}`);

  if (status === 401 || status === 403) {
    return status === 401
      ? new AuthenticationError(ADAPTER_NAME, message)
      : new PermissionError(ADAPTER_NAME, message);
  }
  if (status === 404) {
    return new ResourceNotFoundError(ADAPTER_NAME, "resource", message);
  }
  if (status === 429) {
    return new AdapterRateLimitError(ADAPTER_NAME);
  }
  if (status >= 500) {
    return new NetworkError(ADAPTER_NAME, message);
  }
  return new AdapterError(message, ADAPTER_NAME, String(status));
}
