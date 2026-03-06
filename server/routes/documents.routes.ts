import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireApprovedUser, requireAuth, requireFeatureAccess } from "../middleware/auth";
import { uploadRateLimiter } from "../middleware/rate-limiter";
import { unauthorized, badRequest } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import {
  applicationDocumentParamsSchema,
  documentCheckBodySchema,
  documentScanBodySchema,
  documentUploadBodySchema,
  bulkDocumentAvailabilitySchema,
} from "../schemas/document";
import {
  checkDocumentCompleteness,
  listDocumentsForApplication,
  uploadDocumentForApplication,
  updateDocumentAvailability,
} from "../services/document.service";
import { scanApplicationDocuments as scanDocumentsForApplication } from "../services/document-scan.service";

export const documentsRouter = Router();

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

const MIME_TO_ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  "application/pdf": new Set(["pdf"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
};

function getFileExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).trim().toLowerCase();
}

function detectMimeTypeFromSignature(bytes: Buffer): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  ) {
    return "application/pdf";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

documentsRouter.use(requireAuth, requireApprovedUser);

documentsRouter.post(
  "/applications/:id/documents/upload",
  requireFeatureAccess("upload_documents"),
  uploadRateLimiter,
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

    const fileExtension = getFileExtension(req.file.originalname);
    if (!fileExtension || !ALLOWED_FILE_EXTENSIONS.has(fileExtension)) {
      throw badRequest("Unsupported file extension. Allowed formats: .pdf, .jpg, .jpeg, .png");
    }

    const allowedExtensionsForMime = MIME_TO_ALLOWED_EXTENSIONS[mimeType];
    if (allowedExtensionsForMime && !allowedExtensionsForMime.has(fileExtension)) {
      throw badRequest("File extension does not match the uploaded content type");
    }

    const signatureMimeType = detectMimeTypeFromSignature(req.file.buffer);
    if (signatureMimeType && signatureMimeType !== mimeType) {
      throw badRequest("File content does not match the declared file type");
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
  requireFeatureAccess("upload_documents"),
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
  requireFeatureAccess("upload_documents"),
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
  requireFeatureAccess("upload_documents"),
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

documentsRouter.post(
  "/applications/:id/documents/availability",
  requireFeatureAccess("upload_documents"),
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(applicationDocumentParamsSchema, req.params);
    const payload = parseWithSchema(bulkDocumentAvailabilitySchema, req.body ?? {});
    const userId = req.auth?.user.id;

    if (!userId) {
      throw unauthorized();
    }

    await updateDocumentAvailability(userId, params.id, payload.availabilities);

    sendSuccess(res, { success: true });
  }),
);
