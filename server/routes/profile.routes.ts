import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { updateProfileSchema } from "../schemas/profile";
import { requireAuth } from "../middleware/auth";
import { internalError, unauthorized } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { supabaseAdmin } from "../lib/supabase/client";

export const profileRouter = Router();

profileRouter.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const payload = parseWithSchema(updateProfileSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to update profile", error);
    }

    sendSuccess(res, data);
  }),
);
