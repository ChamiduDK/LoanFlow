import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const isDevelopment = env.NODE_ENV === "development";

/**
 * Global rate limiter: 100 requests per 15 minutes
 */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
  max: isDevelopment ? Number.MAX_SAFE_INTEGER : env.RATE_LIMIT_GLOBAL_MAX,
  skip: () => isDevelopment,
  message: {
    success: false,
    error: {
      message: "Too many requests from this IP, please try again after 15 minutes",
      code: "TOO_MANY_REQUESTS",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for authentication routes: 5 requests per 10 minutes
 */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: isDevelopment ? Math.max(env.RATE_LIMIT_AUTH_MAX, 50) : env.RATE_LIMIT_AUTH_MAX,
  message: {
    success: false,
    error: {
      message: "Too many login attempts, please try again after 10 minutes",
      code: "TOO_MANY_REQUESTS",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for document uploads: 10 uploads per 10 minutes
 */
export const uploadRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_UPLOAD_WINDOW_MS,
  max: isDevelopment ? Math.max(env.RATE_LIMIT_UPLOAD_MAX, 100) : env.RATE_LIMIT_UPLOAD_MAX,
  message: {
    success: false,
    error: {
      message: "Too many document uploads, please try again after 10 minutes",
      code: "TOO_MANY_REQUESTS",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
