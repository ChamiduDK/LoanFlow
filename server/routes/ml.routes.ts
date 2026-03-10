import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { sendSuccess } from "../lib/response";
import { requireApprovedUser, requireAuth, requireAdmin } from "../middleware/auth";
import { unauthorized } from "../lib/errors";
import { activateMlModelParamsSchema, predictMlSchema, trainMlSchema } from "../schemas/ml";
import { predictApprovalProbability } from "../services/ml/prediction.service";
import { activateMlModel, getMlTrainingReadiness, listMlModels, trainMlApprovalModel } from "../services/ml/training.service";

export const mlRouter = Router();

mlRouter.use(requireAuth, requireApprovedUser);

mlRouter.post(
  "/ml/predict",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(predictMlSchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const prediction = await predictApprovalProbability({
      applicationId: payload.application_id,
      viewerUserId: userId,
      productId: payload.product_id,
    });

    sendSuccess(res, {
      application_id: payload.application_id,
      product_id: payload.product_id ?? prediction.feature_sample.product_id,
      probability: prediction.probability,
      probability_percent: prediction.probability_percent,
      source: prediction.source,
      fallback_mode: prediction.fallback_mode,
      model: prediction.model,
      confidence: prediction.confidence,
      explainability: prediction.explainability,
    });
  }),
);

mlRouter.post(
  "/ml/train",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(trainMlSchema, req.body ?? {});
    const result = await trainMlApprovalModel(req.auth?.user.id, payload, req.ip);
    sendSuccess(res, result, undefined, 201);
  }),
);

mlRouter.get(
  "/ml/models",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const models = await listMlModels();
    sendSuccess(res, models);
  }),
);

mlRouter.get(
  "/ml/readiness",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const readiness = await getMlTrainingReadiness();
    sendSuccess(res, readiness);
  }),
);

mlRouter.post(
  "/ml/activate-model/:modelId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(activateMlModelParamsSchema, req.params);
    const activated = await activateMlModel(params.modelId, req.auth?.user.id, req.ip);
    sendSuccess(res, activated);
  }),
);
