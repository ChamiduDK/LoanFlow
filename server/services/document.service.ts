import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { badRequest, forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";

type UploadInput = {
  userId: string;
  applicationId: string;
  documentType: string;
  productId?: string;
  file: Express.Multer.File;
  ipAddress?: string | null;
};

type ChecklistItem = {
  document_type: string;
  display_name: string;
  required: boolean;
  uploaded: boolean;
  has_uploaded_record: boolean;
  latest_document_id: string | null;
  latest_status: string | null;
  latest_validation_status: string | null;
  latest_uploaded_at: string | null;
};

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getFileExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).trim().toLowerCase();
}

function normalizeDocumentType(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDocumentWorkflowStatus(value: unknown): string {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "uploaded" || status === "processing" || status === "verified" || status === "rejected" || status === "needs_review") {
    return status;
  }

  return "needs_review";
}

function normalizeValidationStatus(value: unknown): "valid" | "invalid" | "unclear" {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "valid" || status === "invalid") {
    return status;
  }

  return "unclear";
}

async function assertApplicationOwnership(
  userId: string,
  applicationId: string,
): Promise<{ id: string; user_id: string; selected_product_id: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id, selected_product_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application", error);
  }

  if (!data) {
    throw notFound("Loan application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot access this application");
  }

  return {
    id: String(data.id),
    user_id: String(data.user_id),
    selected_product_id: data.selected_product_id ? String(data.selected_product_id) : null,
  };
}

export async function uploadDocumentForApplication(input: UploadInput): Promise<Record<string, unknown>> {
  await assertApplicationOwnership(input.userId, input.applicationId);

  if (!input.file?.buffer || input.file.buffer.byteLength === 0) {
    throw badRequest("Uploaded file is empty");
  }

  const normalizedDocumentType = input.documentType.trim().toLowerCase();
  if (!normalizedDocumentType) {
    throw badRequest("Document type is required");
  }

  if (input.productId) {
    const requiredDocResult = await supabaseAdmin
      .from("required_documents")
      .select("id, accepted_formats")
      .eq("product_id", input.productId)
      .eq("document_type", normalizedDocumentType)
      .maybeSingle();

    if (requiredDocResult.error) {
      throw internalError("Failed to validate required document type", requiredDocResult.error);
    }

    if (!requiredDocResult.data) {
      throw badRequest("Document type is not configured for the selected product");
    }

    const allowedFormats = Array.isArray(requiredDocResult.data.accepted_formats)
      ? requiredDocResult.data.accepted_formats.map((value) => String(value).trim().toLowerCase())
      : [];
    const fileExtension = getFileExtension(input.file.originalname);

    if (allowedFormats.length > 0 && (!fileExtension || !allowedFormats.includes(fileExtension))) {
      throw badRequest(`File extension .${fileExtension ?? "unknown"} is not allowed for this document type`);
    }
  }

  const safeName = sanitizeFilename(input.file.originalname);
  const path = `${input.userId}/${input.applicationId}/${Date.now()}-${randomUUID()}-${safeName}`;

  const upload = await supabaseAdmin.storage.from(env.SUPABASE_DOCS_BUCKET).upload(path, input.file.buffer, {
    contentType: input.file.mimetype,
    upsert: false,
  });

  if (upload.error) {
    throw internalError("Failed to upload document to storage", upload.error);
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .insert({
      application_id: input.applicationId,
      user_id: input.userId,
      product_id: input.productId ?? null,
      document_type: normalizedDocumentType,
      file_name: input.file.originalname,
      storage_bucket: env.SUPABASE_DOCS_BUCKET,
      storage_path: path,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
      status: "uploaded",
      detected_doc_type: null,
      ocr_text: null,
      extracted_json: {},
      validation_status: "unclear",
      metadata: {
        originalName: input.file.originalname,
      },
    })
    .select("*")
    .single();

  if (error || !data) {
    throw internalError("Failed to create document metadata", error);
  }

  await logAudit({
    actorUserId: input.userId,
    action: "document.uploaded",
    entityType: "documents",
    entityId: data.id,
    payloadSummary: {
      applicationId: input.applicationId,
      documentType: normalizedDocumentType,
      sizeBytes: input.file.size,
    },
    ipAddress: input.ipAddress ?? null,
  });

  return data;
}

export async function listDocumentsForApplication(userId: string, applicationId: string): Promise<Record<string, unknown>[]> {
  await assertApplicationOwnership(userId, applicationId);

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw internalError("Failed to fetch documents", error);
  }

  const rows = data ?? [];

  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      const signedUrlResult = await supabaseAdmin.storage
        .from(row.storage_bucket as string)
        .createSignedUrl(row.storage_path as string, 60 * 15);

      const { ocr_text: _ocrText, ...rowWithoutRawOcr } = row as Record<string, unknown>;
      const ocrPreview =
        typeof row.ocr_text === "string" && row.ocr_text.trim().length > 0
          ? `${row.ocr_text.trim().slice(0, 220)}${row.ocr_text.trim().length > 220 ? "..." : ""}`
          : null;

      return {
        ...rowWithoutRawOcr,
        ocr_preview: ocrPreview,
        signed_url: signedUrlResult.error ? null : signedUrlResult.data?.signedUrl ?? null,
      };
    }),
  );

  return withSignedUrls;
}

export async function checkDocumentCompleteness(
  userId: string,
  applicationId: string,
  productIds?: string[],
): Promise<Record<string, unknown>> {
  const ownedApplication = await assertApplicationOwnership(userId, applicationId);
  const explicitProductIds = Array.from(
    new Set((productIds ?? []).map((value) => String(value).trim()).filter((value) => value.length > 0)),
  );
  let targetProductIds = explicitProductIds;

  if (targetProductIds.length === 0) {
    const appliedProductsResult = await supabaseAdmin
      .from("application_results")
      .select("product_id")
      .eq("application_id", applicationId);

    if (appliedProductsResult.error) {
      throw internalError("Failed to load application product context", appliedProductsResult.error);
    }

    targetProductIds = Array.from(
      new Set(
        (appliedProductsResult.data ?? [])
          .map((row) => (row.product_id ? String(row.product_id).trim() : ""))
          .filter((value) => value.length > 0),
      ),
    );
  }

  if (targetProductIds.length === 0 && ownedApplication.selected_product_id) {
    targetProductIds = [ownedApplication.selected_product_id];
  }

  const [uploadedDocsResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from("documents")
      .select("id, document_type, product_id, status, validation_status, created_at")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    targetProductIds.length > 0
      ? supabaseAdmin
          .from("loan_products")
          .select("id, name, bank_id, banks(name)")
          .in("id", targetProductIds)
          .eq("is_active", true)
      : supabaseAdmin.from("loan_products").select("id, name, bank_id, banks(name)").eq("is_active", true),
  ]);

  if (uploadedDocsResult.error) {
    throw internalError("Failed to load uploaded documents", uploadedDocsResult.error);
  }

  if (productsResult.error) {
    throw internalError("Failed to load loan products", productsResult.error);
  }

  const products = productsResult.data ?? [];

  if (products.length === 0) {
    return {
      summary: {
        overall_completeness: 0,
        total_required: 0,
        total_missing: 0,
      },
      by_scheme: [],
      missing_docs: [],
    };
  }

  const productIdList = products.map((item) => item.id as string);

  const requiredResult = await supabaseAdmin
    .from("required_documents")
    .select("id, product_id, document_type, display_name, is_required")
    .in("product_id", productIdList)
    .order("document_type", { ascending: true });

  if (requiredResult.error) {
    throw internalError("Failed to load required document definitions", requiredResult.error);
  }

  const requiredDocs = requiredResult.data ?? [];
  const uploadedDocs = uploadedDocsResult.data ?? [];

  const checks: Array<Record<string, unknown>> = [];
  const upsertRows: Array<Record<string, unknown>> = [];
  let requiredTotal = 0;
  let missingTotal = 0;

  for (const product of products) {
    const perProduct = requiredDocs.filter((doc) => doc.product_id === product.id);
    const latestDocByType = new Map<
      string,
      {
        id: string;
        status: string;
        validation_status: "valid" | "invalid" | "unclear";
        created_at: string | null;
      }
    >();

    for (const uploaded of uploadedDocs) {
      const uploadedProductId = uploaded.product_id ? String(uploaded.product_id) : null;
      if (uploadedProductId && uploadedProductId !== product.id) {
        continue;
      }

      const normalizedType = normalizeDocumentType(uploaded.document_type);
      if (!normalizedType || latestDocByType.has(normalizedType)) {
        continue;
      }

      latestDocByType.set(normalizedType, {
        id: String(uploaded.id),
        status: normalizeDocumentWorkflowStatus(uploaded.status),
        validation_status: normalizeValidationStatus(uploaded.validation_status),
        created_at: uploaded.created_at ? String(uploaded.created_at) : null,
      });
    }

    const checklist: ChecklistItem[] = perProduct.map((doc) => {
      const latestDoc = latestDocByType.get(normalizeDocumentType(doc.document_type));
      const hasUploadedRecord = Boolean(latestDoc);
      const workflowStatus = latestDoc?.status ?? null;
      const validationStatus = latestDoc?.validation_status ?? null;
      const uploaded = hasUploadedRecord && workflowStatus !== "rejected" && validationStatus !== "invalid";

      return {
        document_type: String(doc.document_type),
        display_name: String(doc.display_name),
        required: Boolean(doc.is_required),
        uploaded,
        has_uploaded_record: hasUploadedRecord,
        latest_document_id: latestDoc?.id ?? null,
        latest_status: workflowStatus,
        latest_validation_status: validationStatus,
        latest_uploaded_at: latestDoc?.created_at ?? null,
      };
    });

    const requiredOnly = checklist.filter((item) => item.required);
    const missingDocs = requiredOnly.filter((item) => !item.uploaded);
    const completeness =
      requiredOnly.length === 0 ? 100 : Number((((requiredOnly.length - missingDocs.length) / requiredOnly.length) * 100).toFixed(2));

    requiredTotal += requiredOnly.length;
    missingTotal += missingDocs.length;

    const schemeCheck = {
      product_id: product.id,
      product_name: product.name,
      bank_id: product.bank_id,
      bank_name: Array.isArray(product.banks)
        ? (product.banks[0] as { name?: string } | undefined)?.name ?? null
        : (product.banks as { name?: string } | null)?.name ?? null,
      completeness_score: completeness,
      checklist,
      missing_docs: missingDocs.map((item) => item.document_type),
    };

    checks.push(schemeCheck);

    const upsertPayload: Record<string, unknown> = {
      application_id: applicationId,
      product_id: product.id,
      user_id: userId,
      checklist_json: checklist,
      missing_docs: missingDocs.map((item) => item.document_type),
      completeness_score: completeness,
      checked_at: new Date().toISOString(),
    };

    upsertRows.push(upsertPayload);
  }

  if (upsertRows.length > 0) {
    const upsert = await supabaseAdmin
      .from("document_checks")
      .upsert(upsertRows, {
        onConflict: "application_id,product_id",
      });

    if (upsert.error) {
      throw internalError("Failed to upsert document checks", upsert.error);
    }
  }

  const overallCompleteness = requiredTotal === 0 ? 100 : Number((((requiredTotal - missingTotal) / requiredTotal) * 100).toFixed(2));

  const missingDocsUnion = Array.from(
    new Set(checks.flatMap((item) => (item.missing_docs as string[]) ?? [])),
  ).sort();

  return {
    summary: {
      overall_completeness: overallCompleteness,
      total_required: requiredTotal,
      total_missing: missingTotal,
    },
    by_scheme: checks,
    missing_docs: missingDocsUnion,
  };
}

export type OcrExtractionResult = {
  success: boolean;
  extractedFields: Record<string, unknown>;
  confidenceScore: number;
};

export interface OcrExtractionProvider {
  extractTextAndFields(storagePath: string, mimeType: string): Promise<OcrExtractionResult>;
}

export const defaultOcrProvider: OcrExtractionProvider = {
  async extractTextAndFields(_storagePath: string, _mimeType: string): Promise<OcrExtractionResult> {
    return {
      success: false,
      extractedFields: {},
      confidenceScore: 0,
    };
  },
};

export async function detectDocumentType(_storagePath: string): Promise<string | null> {
  return null;
}

export async function validateDocumentRecency(_storagePath: string, _maxAgeDays: number): Promise<boolean> {
  return true;
}
