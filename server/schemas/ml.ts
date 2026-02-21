import { z } from "zod";
import { uuidSchema } from "./common";

export const trainMlSchema = z.object({
  epochs: z.number().int().min(10).max(500).optional(),
  batch_size: z.number().int().min(8).max(512).optional(),
  validation_split: z.number().min(0.1).max(0.4).optional(),
  min_samples: z.number().int().min(20).max(50000).optional(),
});

export const predictMlSchema = z.object({
  application_id: uuidSchema,
  product_id: uuidSchema.optional(),
});

export const activateMlModelParamsSchema = z.object({
  modelId: uuidSchema,
});
