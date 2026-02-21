import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { unauthorized, badRequest } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import {
  applicationDocumentParamsSchema,
  documentCheckBodySchema,
  documentScanBodySchema,
  documentUploadBodySchema,
} from "../schemas/document";
import {
  checkDocumentCompleteness,
  listDocumentsForApplication,
  uploadDocumentForApplication,
} from "../services/document.service";
import { scanApplicationDocuments as scanDocumentsForApplication } from "../services/document-scan.service";

export const documentsRouter = Router();

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

documentsRouter.use(requireAuth);

documentsRouter.post(
  "/applications/:id/documents/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationDocumentParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    if (!req.file) {
      throw badRequest("Missing file input. Expected multipart field 'file'");
    }

    const mimeType = req.file.mimetype.toLowerCase();
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw badRequest("Unsupported file type. Allowed formats: PDF, JPG, PNG");
    }

    const payload = parseWithSchema(documentUploadBodySchema, req.body);

    const document = await uploadDocumentForApplication({
      userId,
      applicationId: params.id,
      documentType: payload.document_type,
      productId: payload.product_id,
      file: req.file,
      ipAddress: req.ip,
    });

    sendSuccess(res, document, undefined, 201);
  }),
);

documentsRouter.get(
  "/applications/:id/documents",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationDocumentParamsSchema, req.params);
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const documents = await listDocumentsForApplication(userId, params.id);

    sendSuccess(res, documents);
  }),
);

documentsRouter.post(
  "/applications/:id/documents/check",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationDocumentParamsSchema, req.params);
    const payload = parseWithSchema(documentCheckBodySchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const checklist = await checkDocumentCompleteness(userId, params.id, payload.product_ids);

    sendSuccess(res, checklist);
  }),
);

documentsRouter.post(
  "/applications/:id/documents/scan",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationDocumentParamsSchema, req.params);
    const payload = parseWithSchema(documentScanBodySchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    const scanResult = await scanDocumentsForApplication(userId, params.id, {
      productId: payload.product_id,
      forceRescan: payload.force_rescan,
      ipAddress: req.ip,
    });

    sendSuccess(res, scanResult);
  }),
);
