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
};

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function assertApplicationOwnership(userId: string, applicationId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id")
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
}

export async function uploadDocumentForApplication(input: UploadInput): Promise<Record<string, unknown>> {
  await assertApplicationOwnership(input.userId, input.applicationId);

  if (!input.file?.buffer || input.file.buffer.byteLength === 0) {
    throw badRequest("Uploaded file is empty");
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
      document_type: input.documentType,
      file_name: input.file.originalname,
      storage_bucket: env.SUPABASE_DOCS_BUCKET,
      storage_path: path,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
      status: "uploaded",
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
      documentType: input.documentType,
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

      return {
        ...row,
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
  await assertApplicationOwnership(userId, applicationId);

  const [uploadedDocsResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from("documents")
      .select("id, document_type, product_id")
      .eq("application_id", applicationId)
      .eq("user_id", userId),
    productIds && productIds.length > 0
      ? supabaseAdmin
          .from("loan_products")
          .select("id, name, bank_id, banks(name)")
          .in("id", productIds)
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
  const uploadedDocTypes = new Set((uploadedDocsResult.data ?? []).map((row) => String(row.document_type)));

  const checks: Array<Record<string, unknown>> = [];
  const upsertRows: Array<Record<string, unknown>> = [];
  let requiredTotal = 0;
  let missingTotal = 0;

  for (const product of products) {
    const perProduct = requiredDocs.filter((doc) => doc.product_id === product.id);

    const checklist: ChecklistItem[] = perProduct.map((doc) => {
      const uploaded = uploadedDocTypes.has(String(doc.document_type));
      return {
        document_type: String(doc.document_type),
        display_name: String(doc.display_name),
        required: Boolean(doc.is_required),
        uploaded,
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
