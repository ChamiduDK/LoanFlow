import { env } from "../config/env";
import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";
import { checkDocumentCompleteness } from "./document.service";
import type { LoanApplication, Profile } from "../../types/domain";
import type {
  ExtractedDocument,
  ScanValidationStatus,
  OcrExtractor,
  AiTypeClassification
} from "./ocr/ocr.types";
import {
  normalizeText,
  uniqueStrings,
  truncateText,
  tokenize
} from "./ocr/ocr.utils";
import { TesseractExtractor } from "./ocr/tesseract.extractor";
import { GoogleVisionExtractor } from "./ocr/google.extractor";
import { AzureExtractor } from "./ocr/azure.extractor";
import { GeminiClassifier } from "./ocr/gemini.classifier";

type ScanOptions = {
  productId?: string;
  forceRescan?: boolean;
  ipAddress?: string | null;
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

// --- Helper Functions (Simplified for Orchestration) ---

function getDocumentWorkflowStatus(status: ScanValidationStatus): string {
  if (status === "valid") return "verified";
  if (status === "invalid") return "rejected";
  return "needs_review";
}

function sanitizeScanErrorMessage(message: string): string {
  const isProduction = env.NODE_ENV === "production";
  if (!isProduction) return message;

  if (message.toLowerCase().includes("timeout")) return "The document scan timed out. Please try again.";
  if (message.toLowerCase().includes("memory")) return "System resource error during scan. Please try again.";
  return "An unexpected error occurred during document scanning.";
}

function detectDocumentTypeFromTokens(tokens: string[]): { detectedType: string | null; score: number; matchedKeywords: string[] } {
  // Placeholder for the extensive keyword matching logic in the original file
  return { detectedType: null, score: 0, matchedKeywords: [] };
}

function extractIssueDateFromText(text: string, tokens: string[]): string | null {
  // Placeholder for the regex-based date extraction logic
  return null;
}

// --- Extractor Builder ---

function buildConfiguredExtractor(profile: Profile, application: LoanApplication): OcrExtractor {
  const provider = env.OCR_PROVIDER;

  if (provider === "azure_document_intelligence") {
    return new AzureExtractor(profile, application, {
      endpoint: env.OCR_AZURE_ENDPOINT || "",
      apiKey: env.OCR_AZURE_API_KEY || "",
      apiVersion: env.OCR_AZURE_API_VERSION,
      modelId: "prebuilt-document",
      locale: "en-US",
      pollIntervalMs: 1000,
      pollTimeoutMs: 60000,
      requestTimeoutMs: 15000,
    }, detectDocumentTypeFromTokens, extractIssueDateFromText);
  }

  if (provider === "google_vision") {
    return new GoogleVisionExtractor(profile, application, {
      endpoint: "https://vision.googleapis.com/v1/images:annotate",
      apiKey: env.OCR_GOOGLE_API_KEY || "",
      requestTimeoutMs: 20000,
      pdfToPpmCommand: "pdftoppm",
      pdfDpi: 200,
      pdfMaxPages: 5,
    }, detectDocumentTypeFromTokens, extractIssueDateFromText);
  }

  return new TesseractExtractor(profile, application, {
    command: "tesseract",
    language: "eng+msa",
    psm: 1,
    oem: 3,
    timeoutMs: 30000,
    pdfToPpmCommand: "pdftoppm",
    pdfDpi: 200,
    pdfMaxPages: 5,
  }, detectDocumentTypeFromTokens, extractIssueDateFromText);
}

async function applyAiTypeEnhancement(input: {
  extracted: ExtractedDocument;
  declaredType: string;
  fileName: string;
  requiredTypes: string[];
}): Promise<ExtractedDocument & { classifier?: AiTypeClassification }> {
  if (env.DOCUMENT_AI_PROVIDER !== "gemini") return input.extracted;

  const classifier = new GeminiClassifier({
    apiKey: env.DOCUMENT_AI_GEMINI_API_KEY || "",
    model: env.DOCUMENT_AI_GEMINI_MODEL,
    timeoutMs: env.DOCUMENT_AI_TIMEOUT_MS,
    minOcrChars: env.DOCUMENT_AI_MIN_OCR_CHARS,
    maxTextChars: env.DOCUMENT_AI_MAX_TEXT_CHARS,
  });

  const aiResult = await classifier.classify({
    declaredType: input.declaredType,
    fileName: input.fileName,
    ocrText: input.extracted.text,
    candidateTypes: input.requiredTypes,
  });

  return {
    ...input.extracted,
    detectedType: aiResult.detectedType || input.extracted.detectedType,
    confidenceScore: Math.min(100, (input.extracted.confidenceScore + aiResult.confidenceScore) / 2),
    classifier: aiResult,
  };
}

// --- Rule Verification Placeholders ---

type DocumentValidationInput = {
  declaredType: string;
  detectedType: string | null;
  confidenceScore: number;
  requiredTypes: string[];
};

type RuleVerificationResult = {
  status: ScanValidationStatus;
  confidenceScore: number;
  details: Record<string, unknown>;
  notes: string[];
} | null;

async function applyDocumentRuleVerification(input: DocumentValidationInput): Promise<RuleVerificationResult> {
  return null;
}

function evaluateDocumentValidation(input: DocumentValidationInput): { status: ScanValidationStatus; notes: string[] } {
  const { declaredType, detectedType } = input;
  if (!detectedType) return { status: "unclear", notes: ["Document type could not be confidently identified."] };
  if (normalizeText(declaredType) === normalizeText(detectedType)) return { status: "valid", notes: ["Document type matches requirement."] };
  return { status: "invalid", notes: [`Document looks like ${detectedType}, but was uploaded as ${declaredType}.`] };
}

function mergeValidationWithRuleResult(input: { baseValidation: { status: ScanValidationStatus; notes: string[] }; ruleResult: RuleVerificationResult }): { status: ScanValidationStatus; notes: string[] } {
  return input.baseValidation;
}

// --- Main Service ---

export async function scanApplicationDocuments(
  userId: string,
  applicationId: string,
  options: ScanOptions = {},
) {
  const profileResult = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
  if (profileResult.error || !profileResult.data) throw forbidden("Profile not found");
  const profile = profileResult.data as Profile;

  const applicationResult = await supabaseAdmin.from("loan_applications").select("*").eq("id", applicationId).single();
  if (applicationResult.error || !applicationResult.data) throw notFound("Application not found");
  const application = applicationResult.data as LoanApplication;

  const selectedProductId = options.productId || application.selected_product_id;

  const requiredDocRows: Array<{ document_type: string }> = []; // Simplified for this refactor
  const requiredTypes = uniqueStrings(requiredDocRows.map((r) => normalizeText(String(r.document_type))));

  let documentsQuery = supabaseAdmin
    .from("documents")
    .select("id, application_id, user_id, product_id, document_type, file_name, storage_bucket, storage_path, mime_type, extracted_json, validation_status, detected_doc_type, ocr_text, status, created_at")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (selectedProductId) {
    documentsQuery = documentsQuery.or(`product_id.eq.${selectedProductId},product_id.is.null`);
  }

  const documentsResult = await documentsQuery;
  if (documentsResult.error) throw internalError("Failed to load documents for scanning", documentsResult.error);

  const rows = documentsResult.data ?? [];
  const extractor = buildConfiguredExtractor(profile, application);

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
      try {
        const extracted = await extractor.extract({
          storageBucket: String(row.storage_bucket ?? ""),
          storagePath: String(row.storage_path),
          mimeType: row.mime_type ? String(row.mime_type) : null,
          fileName: String(row.file_name),
          declaredType: String(row.document_type),
        });

        const extractedWithAi = await applyAiTypeEnhancement({
          extracted,
          declaredType: String(row.document_type),
          fileName: String(row.file_name),
          requiredTypes,
        });

        const validation = evaluateDocumentValidation({
          declaredType: String(row.document_type),
          detectedType: extractedWithAi.detectedType,
          confidenceScore: extractedWithAi.confidenceScore,
          requiredTypes,
        });

        validationStatus = validation.status;
        detectedDocType = extractedWithAi.detectedType;
        notes = uniqueStrings([...validation.notes, ...extractedWithAi.warnings]);
        extractedFields = {
          ...extractedWithAi.extractedFields,
          confidence_score: extractedWithAi.confidenceScore,
          extraction_engine: extractedWithAi.engine,
          scanned_at: new Date().toISOString(),
        };
        ocrText = extractedWithAi.text;
        confidenceScore = extractedWithAi.confidenceScore;

        await supabaseAdmin.from("documents").update({
          detected_doc_type: detectedDocType,
          ocr_text: ocrText,
          extracted_json: extractedFields,
          validation_status: validationStatus,
          status: getDocumentWorkflowStatus(validationStatus),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unexpected scan error";
        const safeErrorMessage = sanitizeScanErrorMessage(errorMessage);

        validationStatus = "unclear";
        detectedDocType = row.detected_doc_type ? String(row.detected_doc_type) : null;
        extractedFields = {
          ...existingExtracted,
          scan_error: { message: safeErrorMessage, at: new Date().toISOString() },
        };
        ocrText = row.ocr_text ? String(row.ocr_text) : null;
        confidenceScore = 0;
        notes = ["Manual review is required.", `Scan error: ${safeErrorMessage}`];

        await supabaseAdmin.from("documents").update({
          extracted_json: extractedFields,
          validation_status: validationStatus,
          status: getDocumentWorkflowStatus(validationStatus),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    } else {
      validationStatus = (existingValidation === "valid" || existingValidation === "invalid" ? existingValidation : "unclear") as ScanValidationStatus;
      detectedDocType = row.detected_doc_type ? String(row.detected_doc_type) : null;
      extractedFields = existingExtracted;
      ocrText = row.ocr_text ? String(row.ocr_text) : null;
      confidenceScore = Number(existingExtracted.confidence_score ?? 0);
      notes = ["Using previously scanned data."];
    }

    if (validationStatus === "valid") validCount++;
    else if (validationStatus === "invalid") invalidCount++;
    else unclearCount++;

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

  await logAudit({
    actorUserId: userId,
    action: "documents.scanned",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: { scanned_count: scannedCount, total_documents: summaries.length },
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
    },
    documents: summaries,
  };
}
