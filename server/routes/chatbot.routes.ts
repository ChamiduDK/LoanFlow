import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireApprovedUser, requireAuth } from "../middleware/auth";
import { chatbotService } from "../services/chatbot.service";
import { sendSuccess } from "../lib/response";
import { z } from "zod";

export const chatbotRouter = Router();

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
});

chatbotRouter.use(requireAuth, requireApprovedUser);

chatbotRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    const userRole = req.auth?.profile?.is_admin ? "admin" : "customer";

    // Zod validation
    const payload = parseWithSchema(chatRequestSchema, req.body);

    const response = await chatbotService.handleChat(userId!, userRole, payload.message, req.ip);

    sendSuccess(res, response);
  }),
);
