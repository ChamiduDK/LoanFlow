import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { knowledgeService } from "../services/knowledge.service";
import { sendSuccess } from "../lib/response";

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth, requireAdmin);

knowledgeRouter.post(
  "/knowledge/reindex",
  asyncHandler(async (_req, res) => {
    const chunkCount = await knowledgeService.reindex();
    sendSuccess(res, { message: "Knowledge base reindexed", chunks: chunkCount });
  }),
);
