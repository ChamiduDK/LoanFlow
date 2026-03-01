import type { ErrorRequestHandler } from "express";
import { env } from "../config/env";
import { ApiError } from "../lib/errors";
import { sendError } from "../lib/response";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const isProduction = env.NODE_ENV === "production";

  if (error instanceof ApiError) {
    const shouldHideDetails = isProduction && error.status >= 500;

    if (error.status >= 400) {
      console.warn(`[ApiError] ${error.status} ${error.code || "UNKNOWN"}: ${error.message}`, error.details || "");
    }

    sendError(
      res,
      {
        message: shouldHideDetails ? "Internal server error" : error.message,
        code: error.code,
        ...(!shouldHideDetails && error.details ? { details: error.details } : {}),
      },
      undefined,
      error.status,
    );
    return;
  }

  if (error instanceof Error) {
    console.error(error);
  } else {
    console.error("Unhandled non-error thrown:", error);
  }

  sendError(
    res,
    {
      message: isProduction ? "Internal server error" : error instanceof Error ? error.message : "Internal server error",
      code: "INTERNAL_ERROR",
    },
    undefined,
    500,
  );
};
