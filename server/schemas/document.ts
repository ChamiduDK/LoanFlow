import { z } from "zod";
import { uuidSchema } from "./common";

export const applicationDocumentParamsSchema = z.object({
  id: uuidSchema,
});

export const documentUploadBodySchema = z.object({
  document_type: z.string().min(2).max(120),
  product_id: uuidSchema.optional(),
});

export const documentCheckBodySchema = z.object({
  product_ids: z.array(uuidSchema).optional(),
  overwrite_existing: z.boolean().optional(),
});

export const documentScanBodySchema = z.object({
  product_id: uuidSchema.optional(),
  force_rescan: z.boolean().optional(),
});
