import type { LoanApplication, Profile } from "../../types/domain";
import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";
import { checkDocumentCompleteness } from "./document.service";

type ScanValidationStatus = "valid" | "invalid" | "unclear";

type ScanOptions = {
  productId?: string;
  forceRescan?: boolean;
  ipAddress?: string | null;
};

type ExtractedDocument = {
  text: string;
  confidenceScore: number;
  detectedType: string | null;
  extractedFields: Record<string, unknown>;
  engine: "ocr" | "placeholder";
};

type ScanDocumentSummary = {
  document_id: string;
  document_type: string;
  file_name: string;
  detected_doc_type: string | null;
  validation_status: ScanValidationStatus;
  confidence_score: number;
  notes: string[];
  extracted_fields: Record<string, unknown>;
  ocr_preview: string | null;
  scanned: boolean;
};

export type DocumentScanResponse = {
  application_id: string;
  product_id: string | null;
  scanned_count: number;
  summary: {
    total_documents: number;
    valid_count: number;
    invalid_count: number;
    unclear_count: number;
    missing_required_count: number;
  };
  documents: ScanDocumentSummary[];
};

interface OcrExtractor {
  extract(input: {
    storagePath: string;
    mimeType: string | null;
    fileName: string;
    declaredType: string;
  }): Promise<ExtractedDocument>;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}

function detectDocumentTypeFromTokens(tokens: string[], fallbackType: string): string | null {
  const tokenSet = new Set(tokens);

  const patterns: Array<{ type: string; keywords: string[] }> = [
    { type: "nic_copy", keywords: ["nic", "identity", "id"] },
    { type: "bank_statement", keywords: ["bank", "statement"] },
    { type: "business_registration", keywords: ["business", "registration", "br"] },
    { type: "financial_statement", keywords: ["financial", "income", "statement"] },
    { type: "tax_certificate", keywords: ["tax", "tin"] },
    { type: "collateral_document", keywords: ["deed", "title", "collateral"] },
  ];

  for (const pattern of patterns) {
    const matched = pattern.keywords.every((keyword) => tokenSet.has(keyword)) ||
      pattern.keywords.some((keyword) => tokenSet.has(keyword));

    if (matched) {
      return pattern.type;
    }
  }

  const declared = normalizeText(fallbackType);
  return declared.length > 0 ? declared : null;
}

function parseDateToken(input: string): string | null {
  const normalized = input.replace(/[^0-9]/g, "");
  if (!/^20\d{6}$/.test(normalized)) {
    return null;
  }

  const year = normalized.slice(0, 4);
  const month = normalized.slice(4, 6);
  const day = normalized.slice(6, 8);
  const iso = `${year}-${month}-${day}`;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return iso;
}

function buildPlaceholderExtractor(profile: Profile, application: LoanApplication): OcrExtractor {
  return {
    async extract(input): Promise<ExtractedDocument> {
      const fileTokens = tokenize(input.fileName);
      const declaredTokens = tokenize(input.declaredType);
      const detectedType = detectDocumentTypeFromTokens(fileTokens, input.declaredType);
      const declaredType = normalizeText(input.declaredType);
      const detectedNormalized = detectedType ? normalizeText(detectedType) : null;
      const overlap = declaredTokens.some((token) => fileTokens.includes(token));
      const typeMatched = detectedNormalized !== null && detectedNormalized === declaredType;

      const dateTokens = fileTokens.map((token) => parseDateToken(token)).filter((token): token is string => token !== null);
      const issueDate = dateTokens[0] ?? null;

      const confidence = overlap
        ? 0.85
        : typeMatched
          ? 0.72
          : 0.4;

      const extractedFields: Record<string, unknown> = {
        source: "placeholder",
        file_name_tokens: fileTokens,
        declared_document_type: input.declaredType,
        detected_document_type: detectedType,
        business_name: profile.business_name ?? null,
        applicant_name: profile.full_name ?? null,
        requested_amount: Number(application.requested_amount ?? 0),
        issue_date: issueDate,
      };

      const text = [
        `Extracted using placeholder parser for ${input.fileName}.`,
        `Declared type: ${input.declaredType}.`,
        detectedType ? `Detected type: ${detectedType}.` : "Detected type unavailable.",
      ].join(" ");

      return {
        text,
        confidenceScore: Number((confidence * 100).toFixed(2)),
        detectedType,
        extractedFields,
        engine: "placeholder",
      };
    },
  };
}

function evaluateDocumentValidation(input: {
  declaredType: string;
  detectedType: string | null;
  confidenceScore: number;
  extractedFields: Record<string, unknown>;
  requiredTypes: Set<string>;
}): {
  status: ScanValidationStatus;
  notes: string[];
} {
  const notes: string[] = [];

  const declaredType = normalizeText(input.declaredType);
  const detectedType = input.detectedType ? normalizeText(input.detectedType) : null;
  const requiredForBank = input.requiredTypes.size === 0 || input.requiredTypes.has(declaredType);

  if (input.requiredTypes.size > 0 && !requiredForBank) {
    notes.push("Document type is not listed in selected bank's required checklist.");
  } else if (requiredForBank) {
    notes.push("Document type matches selected bank checklist.");
  }

  if (detectedType && detectedType !== declaredType) {
    notes.push(`Detected document type (${detectedType}) differs from declared type (${declaredType}).`);
    return {
      status: "invalid",
      notes,
    };
  }

  if (input.confidenceScore >= 75) {
    notes.push("Extraction confidence is high.");
    return {
      status: "valid",
      notes,
    };
  }

  if (input.confidenceScore >= 55) {
    notes.push("Extraction confidence is moderate; manual review recommended.");
    return {
      status: "unclear",
      notes,
    };
  }

  notes.push("Extraction confidence is low.");
  return {
    status: requiredForBank ? "unclear" : "invalid",
    notes,
  };
}

function getDocumentWorkflowStatus(status: ScanValidationStatus): "verified" | "rejected" | "needs_review" {
  if (status === "valid") {
    return "verified";
  }
  if (status === "invalid") {
    return "rejected";
  }
  return "needs_review";
}

async function loadOwnedApplication(userId: string, applicationId: string): Promise<LoanApplication> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application", error);
  }

  if (!data) {
    throw notFound("Application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot access this application");
  }

  return data as LoanApplication;
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load profile", error);
  }

  if (!data) {
    throw notFound("Profile not found");
  }

  return data as Profile;
}

export async function scanApplicationDocuments(
  userId: string,
  applicationId: string,
  options: ScanOptions,
): Promise<DocumentScanResponse> {
  const [application, profile] = await Promise.all([
    loadOwnedApplication(userId, applicationId),
    loadProfile(userId),
  ]);

  const selectedProductId = options.productId ?? application.selected_product_id ?? null;
  const requiredDocsResult = selectedProductId
    ? await supabaseAdmin
        .from("required_documents")
        .select("document_type")
        .eq("product_id", selectedProductId)
        .eq("is_required", true)
    : { data: [], error: null };

  if (requiredDocsResult.error) {
    throw internalError("Failed to load selected bank requirements", requiredDocsResult.error);
  }

  const requiredTypes = new Set(
    (requiredDocsResult.data ?? []).map((row) => normalizeText(String(row.document_type))),
  );

  let documentsQuery = supabaseAdmin
    .from("documents")
    .select(
      "id, application_id, user_id, product_id, document_type, file_name, storage_path, mime_type, extracted_json, validation_status, detected_doc_type, ocr_text, status, created_at",
    )
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (selectedProductId) {
    documentsQuery = documentsQuery.or(`product_id.eq.${selectedProductId},product_id.is.null`);
  }

  const documentsResult = await documentsQuery;

  if (documentsResult.error) {
    throw internalError("Failed to load documents for scanning", documentsResult.error);
  }

  const rows = documentsResult.data ?? [];
  const extractor = buildPlaceholderExtractor(profile, application);

  let scannedCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  let unclearCount = 0;

  const summaries: ScanDocumentSummary[] = [];

  for (const row of rows) {
    const existingExtracted = row.extracted_json && typeof row.extracted_json === "object"
      ? (row.extracted_json as Record<string, unknown>)
      : {};
    const existingValidation = String(row.validation_status ?? "unclear").toLowerCase();
    const shouldRescan = Boolean(options.forceRescan) || !existingValidation || Object.keys(existingExtracted).length === 0;

    let validationStatus: ScanValidationStatus;
    let detectedDocType: string | null;
    let notes: string[];
    let extractedFields: Record<string, unknown>;
    let ocrText: string | null;
    let confidenceScore: number;
    let scanned = false;

    if (shouldRescan) {
      scanned = true;
      scannedCount += 1;

      const extracted = await extractor.extract({
        storagePath: String(row.storage_path),
        mimeType: row.mime_type ? String(row.mime_type) : null,
        fileName: String(row.file_name),
        declaredType: String(row.document_type),
      });

      const validation = evaluateDocumentValidation({
        declaredType: String(row.document_type),
        detectedType: extracted.detectedType,
        confidenceScore: extracted.confidenceScore,
        extractedFields: extracted.extractedFields,
        requiredTypes,
      });

      validationStatus = validation.status;
      detectedDocType = extracted.detectedType;
      notes = validation.notes;
      extractedFields = {
        ...extracted.extractedFields,
        confidence_score: extracted.confidenceScore,
        extraction_engine: extracted.engine,
        scanned_at: new Date().toISOString(),
      };
      ocrText = extracted.text;
      confidenceScore = extracted.confidenceScore;

      const updateDocument = await supabaseAdmin
        .from("documents")
        .update({
          detected_doc_type: detectedDocType,
          ocr_text: ocrText,
          extracted_json: extractedFields,
          validation_status: validationStatus,
          status: getDocumentWorkflowStatus(validationStatus),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateDocument.error) {
        throw internalError("Failed to persist document scan result", updateDocument.error);
      }
    } else {
      validationStatus = existingValidation === "valid" || existingValidation === "invalid"
        ? existingValidation
        : "unclear";
      detectedDocType = row.detected_doc_type ? String(row.detected_doc_type) : null;
      extractedFields = existingExtracted;
      ocrText = row.ocr_text ? String(row.ocr_text) : null;
      confidenceScore = Number(existingExtracted.confidence_score ?? 0);
      notes = ["Using previously scanned extraction data."];
    }

    if (validationStatus === "valid") {
      validCount += 1;
    } else if (validationStatus === "invalid") {
      invalidCount += 1;
    } else {
      unclearCount += 1;
    }

    summaries.push({
      document_id: String(row.id),
      document_type: String(row.document_type),
      file_name: String(row.file_name),
      detected_doc_type: detectedDocType,
      validation_status: validationStatus,
      confidence_score: Number(confidenceScore.toFixed(2)),
      notes,
      extracted_fields: extractedFields,
      ocr_preview: truncateText(ocrText, 220),
      scanned,
    });
  }

  const checklist = selectedProductId
    ? await checkDocumentCompleteness(userId, applicationId, [selectedProductId])
    : await checkDocumentCompleteness(userId, applicationId);

  const missingRequiredCount = selectedProductId
    ? Number(
        (
          (((checklist.by_scheme as Array<Record<string, unknown>> | undefined) ?? [])[0] as Record<string, unknown> | undefined)
            ?.missing_docs as string[] | undefined
        )?.length ?? 0,
      )
    : Number((checklist.summary as Record<string, unknown> | undefined)?.total_missing ?? 0);

  if (selectedProductId) {
    const scheme = (((checklist.by_scheme as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {}) as Record<string, unknown>;
    const upsert = await supabaseAdmin
      .from("document_checks")
      .upsert(
        {
          application_id: applicationId,
          product_id: selectedProductId,
          user_id: userId,
          checklist_json: scheme.checklist ?? [],
          missing_docs: scheme.missing_docs ?? [],
          completeness_score: Number(scheme.completeness_score ?? 0),
          validation_notes_json: summaries.map((item) => ({
            document_type: item.document_type,
            file_name: item.file_name,
            status: item.validation_status,
            notes: item.notes,
            confidence_score: item.confidence_score,
          })),
          checked_at: new Date().toISOString(),
        },
        { onConflict: "application_id,product_id" },
      );

    if (upsert.error) {
      throw internalError("Failed to persist document scan checklist notes", upsert.error);
    }
  }

  await logAudit({
    actorUserId: userId,
    action: "documents.scanned",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      product_id: selectedProductId,
      scanned_count: scannedCount,
      total_documents: summaries.length,
      valid_count: validCount,
      invalid_count: invalidCount,
      unclear_count: unclearCount,
    },
    ipAddress: options.ipAddress ?? null,
  });

  return {
    application_id: applicationId,
    product_id: selectedProductId ? String(selectedProductId) : null,
    scanned_count: scannedCount,
    summary: {
      total_documents: summaries.length,
      valid_count: validCount,
      invalid_count: invalidCount,
      unclear_count: unclearCount,
      missing_required_count: missingRequiredCount,
    },
    documents: summaries,
  };
}
