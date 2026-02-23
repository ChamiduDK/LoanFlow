import type { LoanApplication, Profile } from "../../types/domain";
import { env } from "../config/env";
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
  warnings: string[];
  engine: "ocr" | "placeholder";
};

type DetectionResult = {
  detectedType: string | null;
  score: number;
  matchedKeywords: string[];
};

type StorageProbeResult = {
  exists: boolean;
  byteLength: number | null;
  detectedMimeType: string | null;
  issues: string[];
};

type StorageObjectContent = StorageProbeResult & {
  bytes: Uint8Array | null;
};

type AzureOcrConfig = {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  modelId: string;
  locale: string | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  requestTimeoutMs: number;
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
    storageBucket: string;
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(headerValue: string | null, fallbackMs: number): number {
  if (!headerValue) {
    return fallbackMs;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(250, Math.floor(seconds * 1000));
  }

  const asDate = new Date(headerValue);
  const ms = asDate.getTime() - Date.now();
  if (Number.isFinite(ms) && ms > 0) {
    return Math.max(250, Math.floor(ms));
  }

  return fallbackMs;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

function extractNestedErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return typeof payload === "string" && payload.trim() ? payload.trim() : null;
  }

  const directMessage = typeof payload.message === "string" ? payload.message.trim() : "";
  if (directMessage) {
    return directMessage;
  }

  if (isRecord(payload.error)) {
    const nestedMessage = typeof payload.error.message === "string" ? payload.error.message.trim() : "";
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return null;
}

function detectMimeTypeFromSignature(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46) { // F
    return "application/pdf";
  }

  if (bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a) {
    return "image/png";
  }

  return null;
}

async function downloadStorageObjectContent(input: {
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
}): Promise<StorageObjectContent> {
  const issues: string[] = [];

  if (!input.storageBucket.trim() || !input.storagePath.trim()) {
    return {
      exists: false,
      byteLength: null,
      detectedMimeType: null,
      issues: ["Document storage metadata is incomplete. Manual review required."],
      bytes: null,
    };
  }

  const downloadResult = await supabaseAdmin.storage
    .from(input.storageBucket)
    .download(input.storagePath);

  if (downloadResult.error || !downloadResult.data) {
    return {
      exists: false,
      byteLength: null,
      detectedMimeType: null,
      issues: ["Unable to read the uploaded file from storage. Manual review required."],
      bytes: null,
    };
  }

  const blobLike = downloadResult.data as unknown as {
    size?: number;
    type?: string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  let bytes: Uint8Array | null = null;
  let byteLength = typeof blobLike.size === "number" ? blobLike.size : null;

  if (typeof blobLike.arrayBuffer === "function") {
    const content = await blobLike.arrayBuffer();
    bytes = new Uint8Array(content);
    byteLength = byteLength ?? bytes.byteLength;
  }

  if (byteLength === 0) {
    issues.push("Stored file is empty.");
  }

  const signatureMimeType = bytes ? detectMimeTypeFromSignature(bytes) : null;
  const blobMimeType = typeof blobLike.type === "string" && blobLike.type.trim().length > 0
    ? blobLike.type.trim().toLowerCase()
    : null;
  const detectedMimeType = signatureMimeType ?? blobMimeType;
  const declaredMimeType = input.mimeType ? input.mimeType.trim().toLowerCase() : null;

  if (declaredMimeType && detectedMimeType && declaredMimeType !== detectedMimeType) {
    issues.push(`File content type looks like ${detectedMimeType}, but upload metadata says ${declaredMimeType}.`);
  }

  return {
    exists: true,
    byteLength,
    detectedMimeType,
    issues,
    bytes,
  };
}

async function probeStorageObject(input: {
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
}): Promise<StorageProbeResult> {
  const content = await downloadStorageObjectContent(input);
  return {
    exists: content.exists,
    byteLength: content.byteLength,
    detectedMimeType: content.detectedMimeType,
    issues: content.issues,
  };
}

function detectDocumentTypeFromTokens(tokens: string[]): DetectionResult {
  const tokenSet = new Set(tokens);

  const has = (...values: string[]) => values.some((value) => tokenSet.has(value));
  const hasAll = (...values: string[]) => values.every((value) => tokenSet.has(value));

  if (has("nic")) {
    return { detectedType: "nic_copy", score: 96, matchedKeywords: ["nic"] };
  }

  if ((has("national", "identity") && has("card", "copy")) || hasAll("national", "identity")) {
    return {
      detectedType: "nic_copy",
      score: has("card", "copy") ? 90 : 82,
      matchedKeywords: uniqueStrings(["national", "identity", has("card") ? "card" : "", has("copy") ? "copy" : ""]),
    };
  }

  if (has("tin")) {
    return { detectedType: "tax_certificate", score: 94, matchedKeywords: ["tin"] };
  }

  if (has("tax") && has("certificate", "registration", "cert")) {
    return {
      detectedType: "tax_certificate",
      score: 88,
      matchedKeywords: uniqueStrings(["tax", has("certificate") ? "certificate" : "", has("registration") ? "registration" : "", has("cert") ? "cert" : ""]),
    };
  }

  if (has("bank") && has("statement", "stmt")) {
    return {
      detectedType: "bank_statement",
      score: 92,
      matchedKeywords: uniqueStrings(["bank", has("statement") ? "statement" : "", has("stmt") ? "stmt" : ""]),
    };
  }

  if (has("account", "acct") && has("statement", "stmt")) {
    return {
      detectedType: "bank_statement",
      score: 82,
      matchedKeywords: uniqueStrings([has("account") ? "account" : "", has("acct") ? "acct" : "", has("statement") ? "statement" : "", has("stmt") ? "stmt" : ""]),
    };
  }

  if ((has("financial") && has("statement", "statements")) || (has("income") && has("statement", "statements"))) {
    return {
      detectedType: "financial_statement",
      score: 90,
      matchedKeywords: uniqueStrings([has("financial") ? "financial" : "", has("income") ? "income" : "", has("statement") ? "statement" : "", has("statements") ? "statements" : ""]),
    };
  }

  if ((has("profit") && has("loss")) || has("pnl")) {
    return {
      detectedType: "financial_statement",
      score: 88,
      matchedKeywords: uniqueStrings([has("profit") ? "profit" : "", has("loss") ? "loss" : "", has("pnl") ? "pnl" : ""]),
    };
  }

  if (has("business") && has("registration", "reg", "certificate", "cert")) {
    return {
      detectedType: "business_registration",
      score: 90,
      matchedKeywords: uniqueStrings(["business", has("registration") ? "registration" : "", has("reg") ? "reg" : "", has("certificate") ? "certificate" : "", has("cert") ? "cert" : ""]),
    };
  }

  if (has("br") && has("certificate", "registration", "cert")) {
    return {
      detectedType: "business_registration",
      score: 84,
      matchedKeywords: uniqueStrings(["br", has("certificate") ? "certificate" : "", has("registration") ? "registration" : "", has("cert") ? "cert" : ""]),
    };
  }

  if (hasAll("title", "deed")) {
    return { detectedType: "collateral_document", score: 94, matchedKeywords: ["title", "deed"] };
  }

  if (has("mortgage", "collateral", "valuation", "deed")) {
    return {
      detectedType: "collateral_document",
      score: 80,
      matchedKeywords: uniqueStrings([
        has("mortgage") ? "mortgage" : "",
        has("collateral") ? "collateral" : "",
        has("valuation") ? "valuation" : "",
        has("deed") ? "deed" : "",
      ]),
    };
  }

  return {
    detectedType: null,
    score: 0,
    matchedKeywords: [],
  };
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

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return iso;
}

function extractIssueDateFromText(text: string, fallbackTokens: string[]): string | null {
  const fallbackDates = fallbackTokens.map((token) => parseDateToken(token)).filter((token): token is string => token !== null);
  if (fallbackDates.length > 0) {
    return fallbackDates[0];
  }

  const normalized = text.slice(0, 4000);

  const yyyyFirst = normalized.match(/\b(20\d{2})[/.-](0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])\b/);
  if (yyyyFirst) {
    return toIsoDate(Number(yyyyFirst[1]), Number(yyyyFirst[2]), Number(yyyyFirst[3]));
  }

  const ddFirst = normalized.match(/\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-](20\d{2})\b/);
  if (ddFirst) {
    return toIsoDate(Number(ddFirst[3]), Number(ddFirst[2]), Number(ddFirst[1]));
  }

  return null;
}

function getAzureOcrConfig(): AzureOcrConfig | null {
  if (env.OCR_PROVIDER !== "azure_document_intelligence") {
    return null;
  }

  if (!env.OCR_AZURE_ENDPOINT || !env.OCR_AZURE_API_KEY) {
    return null;
  }

  return {
    endpoint: env.OCR_AZURE_ENDPOINT.replace(/\/+$/, ""),
    apiKey: env.OCR_AZURE_API_KEY,
    apiVersion: env.OCR_AZURE_API_VERSION,
    modelId: env.OCR_AZURE_MODEL_ID,
    locale: env.OCR_AZURE_LOCALE?.trim() ? env.OCR_AZURE_LOCALE.trim() : null,
    pollIntervalMs: env.OCR_AZURE_POLL_INTERVAL_MS,
    pollTimeoutMs: env.OCR_AZURE_POLL_TIMEOUT_MS,
    requestTimeoutMs: env.OCR_AZURE_REQUEST_TIMEOUT_MS,
  };
}

function buildAzureAnalyzeUrl(config: AzureOcrConfig): string {
  const params = new URLSearchParams({
    "api-version": config.apiVersion,
    "_overload": "analyzeDocument",
  });

  if (config.locale) {
    params.set("locale", config.locale);
  }

  return `${config.endpoint}/documentintelligence/documentModels/${encodeURIComponent(config.modelId)}:analyze?${params.toString()}`;
}

function getAzureHeaders(config: AzureOcrConfig): Record<string, string> {
  return {
    "Ocp-Apim-Subscription-Key": config.apiKey,
  };
}

function getAzureOperationId(operationLocation: string): string | null {
  try {
    const url = new URL(operationLocation);
    const match = url.pathname.match(/\/analyzeResults\/([^/]+)$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function runAzureDocumentAnalysis(input: {
  config: AzureOcrConfig;
  base64Source: string;
}): Promise<{ payload: Record<string, unknown>; operationLocation: string }> {
  const analyzeResponse = await fetchWithTimeout(
    buildAzureAnalyzeUrl(input.config),
    {
      method: "POST",
      headers: {
        ...getAzureHeaders(input.config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64Source: input.base64Source,
      }),
    },
    input.config.requestTimeoutMs,
  );

  if (!(analyzeResponse.status === 202 || analyzeResponse.ok)) {
    const payload = await readResponsePayload(analyzeResponse);
    const remoteMessage = extractNestedErrorMessage(payload);
    throw new Error(
      `Azure OCR analyze request failed (${analyzeResponse.status})${remoteMessage ? `: ${remoteMessage}` : ""}`,
    );
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure OCR analyze request did not return an operation-location header.");
  }

  const startedAt = Date.now();
  let waitMs = parseRetryAfterMs(analyzeResponse.headers.get("retry-after"), input.config.pollIntervalMs);

  while (Date.now() - startedAt <= input.config.pollTimeoutMs) {
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const pollResponse = await fetchWithTimeout(
      operationLocation,
      {
        method: "GET",
        headers: getAzureHeaders(input.config),
      },
      input.config.requestTimeoutMs,
    );

    const payload = await readResponsePayload(pollResponse);

    if (!pollResponse.ok) {
      const remoteMessage = extractNestedErrorMessage(payload);
      throw new Error(
        `Azure OCR poll request failed (${pollResponse.status})${remoteMessage ? `: ${remoteMessage}` : ""}`,
      );
    }

    if (!isRecord(payload)) {
      throw new Error("Azure OCR poll response was not valid JSON.");
    }

    const statusValue = typeof payload.status === "string" ? normalizeText(payload.status) : "";

    if (statusValue === "succeeded") {
      return {
        payload,
        operationLocation,
      };
    }

    if (statusValue === "failed" || statusValue === "canceled") {
      const remoteMessage = extractNestedErrorMessage(payload);
      const operationId = getAzureOperationId(operationLocation);
      throw new Error(
        `Azure OCR analysis ${statusValue}${operationId ? ` (operation ${operationId})` : ""}${remoteMessage ? `: ${remoteMessage}` : ""}`,
      );
    }

    waitMs = parseRetryAfterMs(pollResponse.headers.get("retry-after"), input.config.pollIntervalMs);
  }

  throw new Error(`Azure OCR analysis timed out after ${input.config.pollTimeoutMs}ms.`);
}

type ParsedAzureOcrPayload = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
  languages: string[];
  modelId: string | null;
  apiVersion: string | null;
};

function parseAzureOcrPayload(payload: Record<string, unknown>): ParsedAzureOcrPayload {
  const analyzeResult = isRecord(payload.analyzeResult) ? payload.analyzeResult : {};
  const text = typeof analyzeResult.content === "string" ? analyzeResult.content.trim() : "";
  const pages = Array.isArray(analyzeResult.pages) ? analyzeResult.pages : [];
  const languagesRaw = Array.isArray(analyzeResult.languages) ? analyzeResult.languages : [];

  let pageCount = 0;
  let lineCount = 0;
  let wordCount = 0;
  let wordConfidenceSum = 0;
  let wordConfidenceCount = 0;
  let minWordConfidence: number | null = null;

  for (const page of pages) {
    if (!isRecord(page)) {
      continue;
    }

    pageCount += 1;
    const lines = Array.isArray(page.lines) ? page.lines : [];
    const words = Array.isArray(page.words) ? page.words : [];
    lineCount += lines.length;

    for (const word of words) {
      if (!isRecord(word)) {
        continue;
      }

      wordCount += 1;
      const confidence = Number(word.confidence);
      if (Number.isFinite(confidence)) {
        wordConfidenceSum += confidence;
        wordConfidenceCount += 1;
        minWordConfidence = minWordConfidence == null ? confidence : Math.min(minWordConfidence, confidence);
      }
    }
  }

  const languages = uniqueStrings(
    languagesRaw.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const locale = typeof entry.locale === "string" ? entry.locale : "";
      return locale ? [locale] : [];
    }),
  );

  return {
    text,
    pageCount,
    lineCount,
    wordCount,
    averageWordConfidence: wordConfidenceCount > 0 ? wordConfidenceSum / wordConfidenceCount : null,
    minWordConfidence,
    languages,
    modelId: typeof analyzeResult.modelId === "string" ? analyzeResult.modelId : null,
    apiVersion: typeof analyzeResult.apiVersion === "string" ? analyzeResult.apiVersion : null,
  };
}

function buildAzureDocumentIntelligenceExtractor(
  profile: Profile,
  application: LoanApplication,
  config: AzureOcrConfig,
): OcrExtractor {
  return {
    async extract(input): Promise<ExtractedDocument> {
      const fileTokens = tokenize(input.fileName);
      const declaredTokens = tokenize(input.declaredType);
      const storageContent = await downloadStorageObjectContent({
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
      });

      if (!storageContent.exists || !storageContent.bytes || storageContent.bytes.byteLength === 0) {
        const storageIssues = storageContent.issues.length > 0
          ? storageContent.issues
          : ["Unable to load file bytes for OCR processing."];
        throw new Error(storageIssues.join(" "));
      }

      const azureResult = await runAzureDocumentAnalysis({
        config,
        base64Source: Buffer.from(storageContent.bytes).toString("base64"),
      });

      const parsed = parseAzureOcrPayload(azureResult.payload);
      const ocrTokens = tokenize(parsed.text.slice(0, 12000));
      const combinedTokens = uniqueStrings([...fileTokens, ...ocrTokens]);
      const detection = detectDocumentTypeFromTokens(combinedTokens);
      const detectedType = detection.detectedType;
      const declaredType = normalizeText(input.declaredType);
      const detectedNormalized = detectedType ? normalizeText(detectedType) : null;
      const overlapCount = declaredTokens.filter((token) => combinedTokens.includes(token)).length;
      const overlapRatio = declaredTokens.length > 0 ? overlapCount / declaredTokens.length : 0;
      const typeMatched = detectedNormalized !== null && detectedNormalized === declaredType;

      let confidenceScore = parsed.averageWordConfidence != null
        ? parsed.averageWordConfidence * 100
        : parsed.text.length > 24
          ? 70
          : 35;

      if (parsed.text.length === 0) {
        confidenceScore = Math.min(confidenceScore, 10);
      }
      if (storageContent.issues.length > 0) {
        confidenceScore = Math.min(confidenceScore, 60);
      }
      if (typeMatched && detection.score > 0) {
        confidenceScore = Math.max(confidenceScore, Math.min(detection.score, 98));
      } else if (!detectedType && overlapRatio >= 0.6) {
        confidenceScore = Math.max(confidenceScore, 72);
      }

      confidenceScore = Number(Math.max(0, Math.min(99, confidenceScore)).toFixed(2));

      const warnings: string[] = [];
      if (storageContent.issues.length > 0) {
        warnings.push(...storageContent.issues);
      }
      if (!parsed.text) {
        warnings.push("OCR completed but no text content was extracted.");
      }
      if (!detectedType) {
        warnings.push("Document type could not be confidently inferred from OCR text.");
      }

      const issueDate = extractIssueDateFromText(parsed.text, fileTokens);
      const operationId = getAzureOperationId(azureResult.operationLocation);
      const extractedFields: Record<string, unknown> = {
        source: "azure_document_intelligence",
        provider: "azure_document_intelligence",
        provider_model_id: parsed.modelId ?? config.modelId,
        provider_api_version: parsed.apiVersion ?? config.apiVersion,
        detected_document_type: detectedType,
        detection_score: detection.score,
        detection_keywords: detection.matchedKeywords,
        declared_document_type: input.declaredType,
        declared_token_overlap_count: overlapCount,
        declared_token_overlap_ratio: Number(overlapRatio.toFixed(2)),
        storage_verified: storageContent.exists,
        storage_size_bytes: storageContent.byteLength,
        detected_mime_type: storageContent.detectedMimeType,
        storage_probe_issues: storageContent.issues,
        page_count: parsed.pageCount,
        line_count: parsed.lineCount,
        word_count: parsed.wordCount,
        average_word_confidence: parsed.averageWordConfidence != null
          ? Number((parsed.averageWordConfidence * 100).toFixed(2))
          : null,
        min_word_confidence: parsed.minWordConfidence != null
          ? Number((parsed.minWordConfidence * 100).toFixed(2))
          : null,
        languages: parsed.languages,
        azure_operation_id: operationId,
        business_name: profile.business_name ?? null,
        applicant_name: profile.full_name ?? null,
        requested_amount: Number(application.requested_amount ?? 0),
        issue_date: issueDate,
      };

      return {
        text: parsed.text,
        confidenceScore,
        detectedType,
        extractedFields,
        warnings: uniqueStrings(warnings),
        engine: "ocr",
      };
    },
  };
}

function buildPlaceholderExtractor(
  profile: Profile,
  application: LoanApplication,
  fallbackReason?: string,
): OcrExtractor {
  return {
    async extract(input): Promise<ExtractedDocument> {
      const fileTokens = tokenize(input.fileName);
      const declaredTokens = tokenize(input.declaredType);
      const detection = detectDocumentTypeFromTokens(fileTokens);
      const detectedType = detection.detectedType;
      const declaredType = normalizeText(input.declaredType);
      const detectedNormalized = detectedType ? normalizeText(detectedType) : null;
      const overlapCount = declaredTokens.filter((token) => fileTokens.includes(token)).length;
      const overlapRatio = declaredTokens.length > 0 ? overlapCount / declaredTokens.length : 0;
      const typeMatched = detectedNormalized !== null && detectedNormalized === declaredType;
      const storageProbe = await probeStorageObject({
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
      });

      const dateTokens = fileTokens.map((token) => parseDateToken(token)).filter((token): token is string => token !== null);
      const issueDate = dateTokens[0] ?? null;

      let confidence = 35;

      if (typeMatched) {
        confidence = Math.max(confidence, detection.score || 72);
      } else if (detectedType && !typeMatched) {
        confidence = Math.max(20, Math.min(45, detection.score - 30));
      } else if (overlapRatio >= 0.6) {
        confidence = 78;
      } else if (overlapRatio > 0) {
        confidence = 62;
      }

      if (!storageProbe.exists) {
        confidence = Math.min(confidence, 20);
      }
      if (storageProbe.byteLength === 0) {
        confidence = Math.min(confidence, 10);
      }
      if (storageProbe.issues.length > 0) {
        confidence = Math.min(confidence, 55);
      }

      const confidenceScore = Number(Math.max(0, Math.min(99, confidence)).toFixed(2));

      const warnings: string[] = [];
      if (fallbackReason) {
        warnings.push(fallbackReason);
      }
      if (storageProbe.issues.length > 0) {
        warnings.push(...storageProbe.issues);
      }
      warnings.push("OCR provider is not configured; verification used file metadata and filename heuristics.");
      if (!detectedType && overlapRatio === 0) {
        warnings.push("Could not infer document type from filename metadata.");
      }

      const extractedFields: Record<string, unknown> = {
        source: "placeholder",
        file_name_tokens: fileTokens,
        declared_document_type: input.declaredType,
        detected_document_type: detectedType,
        detection_score: detection.score,
        detection_keywords: detection.matchedKeywords,
        declared_token_overlap_count: overlapCount,
        declared_token_overlap_ratio: Number(overlapRatio.toFixed(2)),
        storage_verified: storageProbe.exists,
        storage_size_bytes: storageProbe.byteLength,
        detected_mime_type: storageProbe.detectedMimeType,
        storage_probe_issues: storageProbe.issues,
        business_name: profile.business_name ?? null,
        applicant_name: profile.full_name ?? null,
        requested_amount: Number(application.requested_amount ?? 0),
        issue_date: issueDate,
      };

      const text = [
        `Extracted using placeholder parser for ${input.fileName}.`,
        `Declared type: ${input.declaredType}.`,
        detectedType ? `Detected type: ${detectedType}.` : "Detected type unavailable.",
        storageProbe.exists ? "Storage file verified." : "Storage file verification failed.",
      ].join(" ");

      return {
        text,
        confidenceScore,
        detectedType,
        extractedFields,
        warnings: uniqueStrings(warnings),
        engine: "placeholder",
      };
    },
  };
}

function buildConfiguredExtractor(profile: Profile, application: LoanApplication): OcrExtractor {
  const azureConfig = getAzureOcrConfig();

  if (azureConfig) {
    return buildAzureDocumentIntelligenceExtractor(profile, application, azureConfig);
  }

  if (env.OCR_PROVIDER === "azure_document_intelligence") {
    return buildPlaceholderExtractor(
      profile,
      application,
      "Azure OCR provider was selected but OCR_AZURE_ENDPOINT/OCR_AZURE_API_KEY are missing. Falling back to placeholder verification.",
    );
  }

  return buildPlaceholderExtractor(profile, application);
}

function evaluateDocumentValidation(input: {
  declaredType: string;
  detectedType: string | null;
  confidenceScore: number;
  requiredTypes: Set<string>;
}): {
  status: ScanValidationStatus;
  notes: string[];
} {
  const notes: string[] = [];

  const declaredType = normalizeText(input.declaredType);
  const detectedType = input.detectedType ? normalizeText(input.detectedType) : null;
  const requiredForBank = input.requiredTypes.size === 0 || input.requiredTypes.has(declaredType);

  if (input.requiredTypes.size === 0) {
    notes.push("No selected bank checklist found; only file-level verification was performed.");
  } else if (!requiredForBank) {
    notes.push("Document type is not listed in selected bank's required checklist.");
  } else {
    notes.push("Document type matches selected bank checklist.");
  }

  if (detectedType && detectedType !== declaredType) {
    notes.push(`Detected document type (${detectedType}) differs from declared type (${declaredType}).`);
    return {
      status: "invalid",
      notes,
    };
  }

  if (!detectedType) {
    notes.push("Document type could not be confidently inferred from filename metadata.");
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
      "id, application_id, user_id, product_id, document_type, file_name, storage_bucket, storage_path, mime_type, extracted_json, validation_status, detected_doc_type, ocr_text, status, created_at",
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

        const validation = evaluateDocumentValidation({
          declaredType: String(row.document_type),
          detectedType: extracted.detectedType,
          confidenceScore: extracted.confidenceScore,
          requiredTypes,
        });

        validationStatus = validation.status;
        detectedDocType = extracted.detectedType;
        notes = uniqueStrings([...validation.notes, ...extracted.warnings]);
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unexpected scan error";

        validationStatus = "unclear";
        detectedDocType = row.detected_doc_type ? String(row.detected_doc_type) : null;
        extractedFields = {
          ...existingExtracted,
          confidence_score: 0,
          extraction_engine: env.OCR_PROVIDER === "azure_document_intelligence" ? "ocr" : "placeholder",
          configured_ocr_provider: env.OCR_PROVIDER,
          scan_error: {
            message: errorMessage,
            at: new Date().toISOString(),
          },
        };
        ocrText = row.ocr_text ? String(row.ocr_text) : null;
        confidenceScore = 0;
        notes = [
          "Document scan could not be completed for this file.",
          "Manual review is required.",
        ];

        const updateDocument = await supabaseAdmin
          .from("documents")
          .update({
            extracted_json: extractedFields,
            validation_status: validationStatus,
            status: getDocumentWorkflowStatus(validationStatus),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateDocument.error) {
          throw internalError("Failed to persist document scan failure state", updateDocument.error);
        }
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
