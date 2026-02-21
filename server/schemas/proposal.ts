import { z } from "zod";
import { uuidSchema } from "./common";

export const proposalParamsSchema = z.object({
  id: uuidSchema,
});

export const generateProposalBodySchema = z.object({
  product_id: uuidSchema.optional(),
});
