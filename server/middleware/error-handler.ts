import type { ErrorRequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { sendError } from "../lib/response";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    sendError(
      res,
      {
        message: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      undefined,
      error.status,
    );
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";

  sendError(
    res,
    {
      message,
      code: "INTERNAL_ERROR",
    },
    undefined,
    500,
  );
};
