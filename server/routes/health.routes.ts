import { Router } from "express";
import { sendSuccess } from "../lib/response";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  sendSuccess(res, {
    service: "loanflow-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
