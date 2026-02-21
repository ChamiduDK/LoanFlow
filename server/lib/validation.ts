import type { ZodTypeAny } from "zod";
import { ApiError } from "./errors";

export function parseWithSchema<TSchema extends ZodTypeAny>(schema: TSchema, input: unknown): ReturnType<TSchema["parse"]> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "Validation failed", parsed.error.flatten());
  }

  return parsed.data;
}
