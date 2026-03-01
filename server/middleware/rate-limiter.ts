import rateLimit from "express-rate-limit";
import { badRequest } from "../lib/errors";

/**
 * Global rate limiter: 100 requests per 15 minutes
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
  windowMs: 10 * 60 * 1000,
  max: 5,
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
  windowMs: 10 * 60 * 1000,
  max: 10,
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
