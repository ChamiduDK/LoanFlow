import type { Response } from "express";
import type { ApiErrorPayload } from "../../types/api";

export function sendSuccess<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>,
  status = 200,
): Response {
  return res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendError(
  res: Response,
  error: ApiErrorPayload,
  meta?: Record<string, unknown>,
  status = 400,
): Response {
  return res.status(status).json({
    success: false,
    error,
    ...(meta ? { meta } : {}),
  });
}
