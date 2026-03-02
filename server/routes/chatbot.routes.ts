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
  sessionId: z.string().uuid().optional(),
});

chatbotRouter.use(requireAuth, requireApprovedUser);

chatbotRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    // Zod validation
    const payload = parseWithSchema(chatRequestSchema, req.body);

    const userId = (req as any).auth?.user.id;
    const userRole = (req as any).auth?.profile?.is_admin ? "admin" : "customer";

    const response = await chatbotService.handleChat(userId!, userRole, payload.message, req.ip, payload.sessionId);

    sendSuccess(res, response);
  }),
);

chatbotRouter.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const userId = (req as any).auth?.user.id;
    const { data, error } = await chatbotService.getUserSessions(userId!);
    if (error) throw error;
    sendSuccess(res, data);
  }),
);

chatbotRouter.get(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as any).auth?.user.id;
    const sessionId = req.params.id as string;
    const { data, error } = await chatbotService.getSessionMessages(userId!, sessionId);
    if (error) throw error;
    sendSuccess(res, data);
  }),
);

chatbotRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const userId = (req as any).auth?.user.id;
    const { data, error } = await chatbotService.createSession(userId!);
    if (error) throw error;
    sendSuccess(res, data, { message: "Session created" }, 201);
  }),
);

chatbotRouter.delete(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as any).auth?.user.id;
    const sessionId = req.params.id as string;
    const { error } = await chatbotService.deleteSession(userId!, sessionId);
    if (error) throw error;
    sendSuccess(res, null, { message: "Session deleted" });
  }),
);
