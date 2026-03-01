import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

type TesseractOcrConfig = {
  command: string;
  language: string;
  psm: number;
  oem: number;
  timeoutMs: number;
  pdfToPpmCommand: string;
  pdfDpi: number;
  pdfMaxPages: number;
};

type GoogleVisionOcrConfig = {
  endpoint: string;
  apiKey: string;
  requestTimeoutMs: number;
  pdfToPpmCommand: string;
  pdfDpi: number;
  pdfMaxPages: number;
};

type GeminiDocClassifierConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  minOcrChars: number;
  maxTextChars: number;
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

type AiTypeClassification = {
  detectedType: string | null;
  confidenceScore: number;
  reason: string;
};

type DocumentVerificationRules = {
  requiredKeywords: string[];
  forbiddenKeywords: string[];
  minTextLength: number | null;
  aiInstructions: string | null;
};

type RequiredDocumentRuleDefinition = {
  documentType: string;
  displayName: string;
  isRequired: boolean;
  rules: DocumentVerificationRules;
};

type AiRuleVerification = {
  status: ScanValidationStatus;
  confidenceScore: number;
  reasons: string[];
  missingRequiredKeywords: string[];
  forbiddenKeywordsFound: string[];
};

type DocumentRuleVerificationResult = {
  status: ScanValidationStatus;
  confidenceScore: number;
  notes: string[];
  details: Record<string, unknown>;
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

function isLikelyGoogleApiKey(value: string): boolean {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(value.trim());
}

function sanitizeScanErrorMessage(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  const redactedKeys = normalized
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_GOOGLE_API_KEY]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]");

  if (redactedKeys.length <= 320) {
    return redactedKeys;
  }

  return `${redactedKeys.slice(0, 317)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTextForSearch(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeRuleKeyword(value: string): string {
  return normalizeTextForSearch(value).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseRuleKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(
    value
      .map((entry) => normalizeRuleKeyword(String(entry)))
      .filter((entry) => entry.length > 0),
  );
}

function parseDocumentVerificationRules(value: unknown): DocumentVerificationRules {
  if (!isRecord(value)) {
    return {
      requiredKeywords: [],
      forbiddenKeywords: [],
      minTextLength: null,
      aiInstructions: null,
    };
  }

  const rawMinLength = Number(value.min_text_length);
  const minTextLength = Number.isFinite(rawMinLength) && rawMinLength >= 0
    ? Math.round(rawMinLength)
    : null;

  const aiInstructions = typeof value.ai_instructions === "string" && value.ai_instructions.trim().length > 0
    ? value.ai_instructions.trim().slice(0, 800)
    : null;

  return {
    requiredKeywords: parseRuleKeywords(value.required_keywords),
    forbiddenKeywords: parseRuleKeywords(value.forbidden_keywords),
    minTextLength,
    aiInstructions,
  };
}

function hasDocumentVerificationRules(value: DocumentVerificationRules): boolean {
  return value.requiredKeywords.length > 0 ||
    value.forbiddenKeywords.length > 0 ||
    value.minTextLength !== null ||
    value.aiInstructions !== null;
}

const DOCUMENT_TYPE_ALIASES: Record<string, string[]> = {
  nic_copy: ["nic_copy", "nic", "national_identity_card", "national_id", "identity_card"],
  tax_certificate: ["tax_certificate", "tin", "tin_certificate", "tax_registration"],
  bank_statement: ["bank_statement", "bank_stmt", "account_statement", "acct_statement"],
  financial_statement: ["financial_statement", "financials", "pnl", "profit_and_loss"],
  business_registration: ["business_registration", "business_reg", "br", "br_certificate"],
  collateral_document: ["collateral_document", "title_deed", "mortgage_document", "valuation_report"],
};

const DOCUMENT_TYPE_ALIAS_LOOKUP = new Map<string, string>(
  Object.entries(DOCUMENT_TYPE_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical] as const),
  ),
);

function normalizeTypeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalizeDocumentType(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeTypeToken(value);
  if (!normalized) {
    return null;
  }

  return DOCUMENT_TYPE_ALIAS_LOOKUP.get(normalized) ?? normalized;
}

function areEquivalentDocumentTypes(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftCanonical = canonicalizeDocumentType(left);
  const rightCanonical = canonicalizeDocumentType(right);
  return leftCanonical !== null && rightCanonical !== null && leftCanonical === rightCanonical;
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

type CommandRunOptions = {
  timeoutMs: number;
  cwd?: string;
};

async function runCommand(command: string, args: string[], options: CommandRunOptions): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      clearTimeout(timer);

      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`Command not found: ${command}`));
        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (timedOut) {
        reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command}`));
        return;
      }

      if (code !== 0) {
        const stderrMessage = stderr.trim();
        reject(new Error(`Command failed (${code}): ${command}${stderrMessage ? ` - ${stderrMessage}` : ""}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function inferMimeTypeFromFileName(fileName: string): string | null {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  return null;
}

function getTempExtension(mimeType: string | null, fileName: string): string {
  const effectiveMimeType = mimeType ?? inferMimeTypeFromFileName(fileName);

  if (effectiveMimeType === "application/pdf") return ".pdf";
  if (effectiveMimeType === "image/jpeg") return ".jpg";
  if (effectiveMimeType === "image/png") return ".png";

  const cleanedName = fileName.trim();
  const dotIndex = cleanedName.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < cleanedName.length - 1) {
    const suffix = cleanedName.slice(dotIndex);
    if (/^\.[a-z0-9]{1,8}$/i.test(suffix)) {
      return suffix.toLowerCase();
    }
  }

  return ".bin";
}

function isPdfMimeType(mimeType: string | null, fileName: string): boolean {
  return (mimeType ?? inferMimeTypeFromFileName(fileName)) === "application/pdf";
}

type ParsedTesseractTsv = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
};

function parseTesseractTsv(tsv: string): ParsedTesseractTsv {
  const rows = tsv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (rows.length === 0) {
    return {
      text: "",
      pageCount: 0,
      lineCount: 0,
      wordCount: 0,
      averageWordConfidence: null,
      minWordConfidence: null,
    };
  }

  const header = rows[0].split("\t");
  const indexOf = (name: string) => header.indexOf(name);

  const levelIdx = indexOf("level");
  const pageIdx = indexOf("page_num");
  const blockIdx = indexOf("block_num");
  const parIdx = indexOf("par_num");
  const lineIdx = indexOf("line_num");
  const confIdx = indexOf("conf");
  const textIdx = indexOf("text");

  if ([levelIdx, pageIdx, blockIdx, parIdx, lineIdx, confIdx, textIdx].some((idx) => idx < 0)) {
    return {
      text: "",
      pageCount: 0,
      lineCount: 0,
      wordCount: 0,
      averageWordConfidence: null,
      minWordConfidence: null,
    };
  }

  type LineAccumulator = {
    page: number;
    block: number;
    paragraph: number;
    line: number;
    words: string[];
  };

  const lineMap = new Map<string, LineAccumulator>();
  const pages = new Set<number>();
  let wordCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let minWordConfidence: number | null = null;

  for (const rowText of rows.slice(1)) {
    const cells = rowText.split("\t");
    const level = Number(cells[levelIdx]);
    const page = Number(cells[pageIdx]);
    const block = Number(cells[blockIdx]);
    const paragraph = Number(cells[parIdx]);
    const lineNumber = Number(cells[lineIdx]);
    const text = (cells[textIdx] ?? "").trim();

    if (Number.isFinite(page) && page > 0) {
      pages.add(page);
    }

    if (level !== 5 || !text) {
      continue;
    }

    wordCount += 1;
    const confidence = Number(cells[confIdx]);
    if (Number.isFinite(confidence) && confidence >= 0) {
      confidenceSum += confidence;
      confidenceCount += 1;
      minWordConfidence = minWordConfidence == null ? confidence : Math.min(minWordConfidence, confidence);
    }

    const key = `${page}:${block}:${paragraph}:${lineNumber}`;
    const existing = lineMap.get(key);
    if (existing) {
      existing.words.push(text);
      continue;
    }

    lineMap.set(key, {
      page: Number.isFinite(page) ? page : 0,
      block: Number.isFinite(block) ? block : 0,
      paragraph: Number.isFinite(paragraph) ? paragraph : 0,
      line: Number.isFinite(lineNumber) ? lineNumber : 0,
      words: [text],
    });
  }

  const orderedLines = Array.from(lineMap.values()).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.block !== b.block) return a.block - b.block;
    if (a.paragraph !== b.paragraph) return a.paragraph - b.paragraph;
    return a.line - b.line;
  });

  const outputLines: string[] = [];
  let lastPage: number | null = null;
  for (const line of orderedLines) {
    if (lastPage != null && line.page !== lastPage) {
      outputLines.push("");
    }
    outputLines.push(line.words.join(" "));
    lastPage = line.page;
  }

  return {
    text: outputLines.join("\n").trim(),
    pageCount: pages.size > 0 ? pages.size : (orderedLines.length > 0 ? 1 : 0),
    lineCount: orderedLines.length,
    wordCount,
    averageWordConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : null,
    minWordConfidence,
  };
}

async function runTesseractOnImageAsTsv(input: {
  config: TesseractOcrConfig;
  imagePath: string;
}): Promise<ParsedTesseractTsv> {
  const args = [
    input.imagePath,
    "stdout",
    "-l",
    input.config.language,
    "--psm",
    String(input.config.psm),
    "--oem",
    String(input.config.oem),
    "tsv",
  ];

  const { stdout } = await runCommand(input.config.command, args, {
    timeoutMs: input.config.timeoutMs,
  });

  return parseTesseractTsv(stdout);
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

function getTesseractOcrConfig(): TesseractOcrConfig | null {
  if (env.OCR_PROVIDER !== "tesseract") {
    return null;
  }

  return {
    command: env.OCR_TESSERACT_COMMAND.trim(),
    language: env.OCR_TESSERACT_LANGUAGE.trim(),
    psm: env.OCR_TESSERACT_PSM,
    oem: env.OCR_TESSERACT_OEM,
    timeoutMs: env.OCR_TESSERACT_TIMEOUT_MS,
    pdfToPpmCommand: env.OCR_PDFTOPPM_COMMAND.trim(),
    pdfDpi: env.OCR_PDF_DPI,
    pdfMaxPages: env.OCR_PDF_MAX_PAGES,
  };
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

function getGoogleVisionOcrConfig(): GoogleVisionOcrConfig | null {
  if (env.OCR_PROVIDER !== "google_vision") {
    return null;
  }

  if (!env.OCR_GOOGLE_API_KEY) {
    return null;
  }

  if (!isLikelyGoogleApiKey(env.OCR_GOOGLE_API_KEY)) {
    return null;
  }

  return {
    endpoint: env.OCR_GOOGLE_ENDPOINT.replace(/\/+$/, ""),
    apiKey: env.OCR_GOOGLE_API_KEY,
    requestTimeoutMs: env.OCR_GOOGLE_REQUEST_TIMEOUT_MS,
    pdfToPpmCommand: env.OCR_PDFTOPPM_COMMAND.trim(),
    pdfDpi: env.OCR_PDF_DPI,
    pdfMaxPages: env.OCR_PDF_MAX_PAGES,
  };
}

function getGeminiDocClassifierConfig(): GeminiDocClassifierConfig | null {
  if (env.DOCUMENT_AI_PROVIDER !== "gemini") {
    return null;
  }

  if (!env.DOCUMENT_AI_GEMINI_API_KEY) {
    return null;
  }

  return {
    apiKey: env.DOCUMENT_AI_GEMINI_API_KEY,
    model: env.DOCUMENT_AI_GEMINI_MODEL,
    timeoutMs: env.DOCUMENT_AI_TIMEOUT_MS,
    minOcrChars: env.DOCUMENT_AI_MIN_OCR_CHARS,
    maxTextChars: env.DOCUMENT_AI_MAX_TEXT_CHARS,
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

type ParsedGoogleVisionPayload = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
  languages: string[];
};

function collectGoogleLanguagesFromProperty(
  property: unknown,
  accumulator: Set<string>,
): void {
  if (!isRecord(property) || !Array.isArray(property.detectedLanguages)) {
    return;
  }

  for (const language of property.detectedLanguages) {
    if (!isRecord(language)) {
      continue;
    }
    const code = typeof language.languageCode === "string" ? language.languageCode.trim() : "";
    if (code) {
      accumulator.add(code);
    }
  }
}

function parseGoogleVisionPayload(payload: Record<string, unknown>): ParsedGoogleVisionPayload {
  const fullTextAnnotation = isRecord(payload.fullTextAnnotation) ? payload.fullTextAnnotation : {};
  const textAnnotations = Array.isArray(payload.textAnnotations) ? payload.textAnnotations : [];
  const pages = Array.isArray(fullTextAnnotation.pages) ? fullTextAnnotation.pages : [];

  const text = typeof fullTextAnnotation.text === "string"
    ? fullTextAnnotation.text.trim()
    : (
      isRecord(textAnnotations[0]) && typeof textAnnotations[0].description === "string"
        ? textAnnotations[0].description.trim()
        : ""
    );

  const languages = new Set<string>();
  collectGoogleLanguagesFromProperty(fullTextAnnotation.property, languages);

  let lineCount = 0;
  let wordCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let minWordConfidence: number | null = null;

  for (const page of pages) {
    if (!isRecord(page)) {
      continue;
    }

    collectGoogleLanguagesFromProperty(page.property, languages);
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];

    for (const block of blocks) {
      if (!isRecord(block)) {
        continue;
      }

      collectGoogleLanguagesFromProperty(block.property, languages);
      const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
      lineCount += paragraphs.length;

      for (const paragraph of paragraphs) {
        if (!isRecord(paragraph)) {
          continue;
        }

        collectGoogleLanguagesFromProperty(paragraph.property, languages);
        const words = Array.isArray(paragraph.words) ? paragraph.words : [];
        wordCount += words.length;

        for (const word of words) {
          if (!isRecord(word)) {
            continue;
          }

          collectGoogleLanguagesFromProperty(word.property, languages);

          const wordConfidence = Number(word.confidence);
          if (Number.isFinite(wordConfidence) && wordConfidence >= 0) {
            confidenceSum += wordConfidence;
            confidenceCount += 1;
            minWordConfidence = minWordConfidence == null
              ? wordConfidence
              : Math.min(minWordConfidence, wordConfidence);
            continue;
          }

          const symbols = Array.isArray(word.symbols) ? word.symbols : [];
          for (const symbol of symbols) {
            if (!isRecord(symbol)) {
              continue;
            }

            collectGoogleLanguagesFromProperty(symbol.property, languages);
            const symbolConfidence = Number(symbol.confidence);
            if (!Number.isFinite(symbolConfidence) || symbolConfidence < 0) {
              continue;
            }

            confidenceSum += symbolConfidence;
            confidenceCount += 1;
            minWordConfidence = minWordConfidence == null
              ? symbolConfidence
              : Math.min(minWordConfidence, symbolConfidence);
          }
        }
      }
    }
  }

  const pageCount = pages.length > 0 ? pages.length : (text ? 1 : 0);
  const normalizedLineCount = lineCount > 0 ? lineCount : (text ? text.split(/\r?\n/).filter(Boolean).length : 0);
  const normalizedWordCount = wordCount > 0 ? wordCount : tokenize(text).length;

  return {
    text,
    pageCount,
    lineCount: normalizedLineCount,
    wordCount: normalizedWordCount,
    averageWordConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : null,
    minWordConfidence,
    languages: Array.from(languages),
  };
}

async function runGoogleVisionTextDetection(input: {
  config: GoogleVisionOcrConfig;
  imageBase64: string;
}): Promise<ParsedGoogleVisionPayload> {
  const endpoint = `${input.config.endpoint}/images:annotate?key=${encodeURIComponent(input.config.apiKey)}`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: input.imageBase64,
            },
            features: [
              {
                type: "DOCUMENT_TEXT_DETECTION",
              },
            ],
          },
        ],
      }),
    },
    input.config.requestTimeoutMs,
  );

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const remoteMessage = extractNestedErrorMessage(payload);
    throw new Error(
      `Google OCR request failed (${response.status})${remoteMessage ? `: ${remoteMessage}` : ""}`,
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.responses) || payload.responses.length === 0) {
    throw new Error("Google OCR response did not contain responses.");
  }

  const firstResponse = payload.responses[0];
  if (!isRecord(firstResponse)) {
    throw new Error("Google OCR response format was invalid.");
  }

  if (isRecord(firstResponse.error)) {
    const remoteMessage = extractNestedErrorMessage(firstResponse.error) ?? "Unknown Google OCR error";
    throw new Error(`Google OCR returned an error: ${remoteMessage}`);
  }

  return parseGoogleVisionPayload(firstResponse);
}

type GoogleVisionOcrExecutionResult = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
  languages: string[];
  warnings: string[];
};

function aggregateGoogleVisionResults(results: ParsedGoogleVisionPayload[]): Omit<GoogleVisionOcrExecutionResult, "warnings"> {
  const text = results
    .map((result) => result.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const pageCount = results.reduce((sum, result) => sum + Math.max(result.pageCount, 1), 0);
  const lineCount = results.reduce((sum, result) => sum + result.lineCount, 0);
  const wordCount = results.reduce((sum, result) => sum + result.wordCount, 0);
  const languages = uniqueStrings(results.flatMap((result) => result.languages));

  let weightedConfidenceSum = 0;
  let weightedConfidenceCount = 0;
  let minWordConfidence: number | null = null;

  for (const result of results) {
    if (result.averageWordConfidence != null && result.wordCount > 0) {
      weightedConfidenceSum += result.averageWordConfidence * result.wordCount;
      weightedConfidenceCount += result.wordCount;
    }

    if (result.minWordConfidence != null) {
      minWordConfidence = minWordConfidence == null
        ? result.minWordConfidence
        : Math.min(minWordConfidence, result.minWordConfidence);
    }
  }

  return {
    text,
    pageCount,
    lineCount,
    wordCount,
    averageWordConfidence: weightedConfidenceCount > 0 ? weightedConfidenceSum / weightedConfidenceCount : null,
    minWordConfidence,
    languages,
  };
}

async function runGoogleVisionOcr(input: {
  config: GoogleVisionOcrConfig;
  fileBytes: Uint8Array;
  mimeType: string | null;
  fileName: string;
}): Promise<GoogleVisionOcrExecutionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "loanflow-google-ocr-"));
  const warnings: string[] = [];

  try {
    const inputExt = getTempExtension(input.mimeType, input.fileName);
    const inputPath = join(tempDir, `source${inputExt}`);
    await writeFile(inputPath, input.fileBytes);

    if (isPdfMimeType(input.mimeType, input.fileName)) {
      const outputPrefix = join(tempDir, "pdf-page");
      const pdfArgs = [
        "-png",
        "-r",
        String(input.config.pdfDpi),
        "-f",
        "1",
        "-l",
        String(input.config.pdfMaxPages),
        inputPath,
        outputPrefix,
      ];

      try {
        await runCommand(input.config.pdfToPpmCommand, pdfArgs, {
          timeoutMs: Math.max(input.config.requestTimeoutMs, 120000),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown pdftoppm error";
        if (message.includes("Command not found")) {
          throw new Error(
            `Google OCR for PDF requires Poppler 'pdftoppm'. Set OCR_PDFTOPPM_COMMAND or install Poppler. (${message})`,
          );
        }
        throw new Error(`Failed to convert PDF pages for Google OCR: ${message}`);
      }

      const files = (await readdir(tempDir))
        .filter((name) => /^pdf-page-\d+\.png$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

      if (files.length === 0) {
        throw new Error("PDF conversion produced no page images for Google OCR.");
      }

      if (files.length >= input.config.pdfMaxPages) {
        warnings.push(`Google OCR processed up to ${input.config.pdfMaxPages} page(s). Increase OCR_PDF_MAX_PAGES for longer files.`);
      }

      const pageResults: ParsedGoogleVisionPayload[] = [];
      for (const file of files) {
        const pageBytes = await readFile(join(tempDir, file));
        const pageResult = await runGoogleVisionTextDetection({
          config: input.config,
          imageBase64: pageBytes.toString("base64"),
        });
        pageResults.push(pageResult);
      }

      return {
        ...aggregateGoogleVisionResults(pageResults),
        warnings,
      };
    }

    const imageBytes = await readFile(inputPath);
    const imageResult = await runGoogleVisionTextDetection({
      config: input.config,
      imageBase64: imageBytes.toString("base64"),
    });

    return {
      ...aggregateGoogleVisionResults([imageResult]),
      warnings,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

type TesseractOcrExecutionResult = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
  warnings: string[];
};

function aggregateTesseractResults(results: ParsedTesseractTsv[]): Omit<TesseractOcrExecutionResult, "warnings"> {
  const text = results
    .map((result) => result.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const pageCount = results.reduce((sum, result) => sum + Math.max(result.pageCount, 1), 0);
  const lineCount = results.reduce((sum, result) => sum + result.lineCount, 0);
  const wordCount = results.reduce((sum, result) => sum + result.wordCount, 0);

  let weightedConfidenceSum = 0;
  let weightedConfidenceCount = 0;
  let minWordConfidence: number | null = null;

  for (const result of results) {
    if (result.averageWordConfidence != null && result.wordCount > 0) {
      weightedConfidenceSum += result.averageWordConfidence * result.wordCount;
      weightedConfidenceCount += result.wordCount;
    }

    if (result.minWordConfidence != null) {
      minWordConfidence = minWordConfidence == null
        ? result.minWordConfidence
        : Math.min(minWordConfidence, result.minWordConfidence);
    }
  }

  return {
    text,
    pageCount,
    lineCount,
    wordCount,
    averageWordConfidence: weightedConfidenceCount > 0 ? weightedConfidenceSum / weightedConfidenceCount : null,
    minWordConfidence,
  };
}

async function runTesseractOcr(input: {
  config: TesseractOcrConfig;
  fileBytes: Uint8Array;
  mimeType: string | null;
  fileName: string;
}): Promise<TesseractOcrExecutionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "loanflow-ocr-"));
  const warnings: string[] = [];

  try {
    const inputExt = getTempExtension(input.mimeType, input.fileName);
    const inputPath = join(tempDir, `source${inputExt}`);
    await writeFile(inputPath, input.fileBytes);

    if (isPdfMimeType(input.mimeType, input.fileName)) {
      const outputPrefix = join(tempDir, "pdf-page");
      const pdfArgs = [
        "-png",
        "-r",
        String(input.config.pdfDpi),
        "-f",
        "1",
        "-l",
        String(input.config.pdfMaxPages),
        inputPath,
        outputPrefix,
      ];

      try {
        await runCommand(input.config.pdfToPpmCommand, pdfArgs, {
          timeoutMs: input.config.timeoutMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown pdftoppm error";
        if (message.includes("Command not found")) {
          throw new Error(
            `PDF OCR requires Poppler 'pdftoppm'. Set OCR_PDFTOPPM_COMMAND or install Poppler. (${message})`,
          );
        }
        throw new Error(`Failed to convert PDF pages for OCR: ${message}`);
      }

      const files = (await readdir(tempDir))
        .filter((name) => /^pdf-page-\d+\.png$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

      if (files.length === 0) {
        throw new Error("PDF conversion produced no page images for OCR.");
      }

      if (files.length >= input.config.pdfMaxPages) {
        warnings.push(`PDF OCR processed up to ${input.config.pdfMaxPages} page(s). Increase OCR_PDF_MAX_PAGES for longer files.`);
      }

      const pageResults: ParsedTesseractTsv[] = [];
      for (const file of files) {
        try {
          const pageResult = await runTesseractOnImageAsTsv({
            config: input.config,
            imagePath: join(tempDir, file),
          });
          pageResults.push(pageResult);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Tesseract OCR error";
          if (message.includes("Command not found")) {
            throw new Error(
              `Tesseract OCR command not found. Set OCR_TESSERACT_COMMAND or install Tesseract OCR. (${message})`,
            );
          }
          throw new Error(`Tesseract OCR failed on PDF page '${file}': ${message}`);
        }
      }

      return {
        ...aggregateTesseractResults(pageResults),
        warnings,
      };
    }

    try {
      const result = await runTesseractOnImageAsTsv({
        config: input.config,
        imagePath: inputPath,
      });

      return {
        ...aggregateTesseractResults([result]),
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Tesseract OCR error";
      if (message.includes("Command not found")) {
        throw new Error(
          `Tesseract OCR command not found. Set OCR_TESSERACT_COMMAND or install Tesseract OCR. (${message})`,
        );
      }
      throw new Error(`Tesseract OCR failed: ${message}`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildTesseractExtractor(
  profile: Profile,
  application: LoanApplication,
  config: TesseractOcrConfig,
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
        const issues = storageContent.issues.length > 0
          ? storageContent.issues
          : ["Unable to load file bytes for OCR processing."];
        throw new Error(issues.join(" "));
      }

      const tesseractResult = await runTesseractOcr({
        config,
        fileBytes: storageContent.bytes,
        mimeType: storageContent.detectedMimeType ?? input.mimeType,
        fileName: input.fileName,
      });

      const ocrTokens = tokenize(tesseractResult.text.slice(0, 12000));
      const combinedTokens = uniqueStrings([...fileTokens, ...ocrTokens]);
      const detection = detectDocumentTypeFromTokens(combinedTokens);
      const detectedType = detection.detectedType;
      const declaredType = normalizeText(input.declaredType);
      const detectedNormalized = detectedType ? normalizeText(detectedType) : null;
      const overlapCount = declaredTokens.filter((token) => combinedTokens.includes(token)).length;
      const overlapRatio = declaredTokens.length > 0 ? overlapCount / declaredTokens.length : 0;
      const typeMatched = detectedNormalized !== null && detectedNormalized === declaredType;

      let confidenceScore = tesseractResult.averageWordConfidence != null
        ? tesseractResult.averageWordConfidence
        : tesseractResult.text.length > 24
          ? 70
          : 35;

      if (!tesseractResult.text) {
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
      warnings.push(...tesseractResult.warnings);
      if (!tesseractResult.text) {
        warnings.push("OCR completed but no text content was extracted.");
      }
      if (!detectedType) {
        warnings.push("Document type could not be confidently inferred from OCR text.");
      }

      const issueDate = extractIssueDateFromText(tesseractResult.text, fileTokens);

      const extractedFields: Record<string, unknown> = {
        source: "tesseract",
        provider: "tesseract",
        provider_model_id: "tesseract-cli",
        provider_api_version: null,
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
        page_count: tesseractResult.pageCount,
        line_count: tesseractResult.lineCount,
        word_count: tesseractResult.wordCount,
        average_word_confidence: tesseractResult.averageWordConfidence != null
          ? Number(tesseractResult.averageWordConfidence.toFixed(2))
          : null,
        min_word_confidence: tesseractResult.minWordConfidence != null
          ? Number(tesseractResult.minWordConfidence.toFixed(2))
          : null,
        languages: uniqueStrings(config.language.split("+")),
        tesseract_command: config.command,
        tesseract_psm: config.psm,
        tesseract_oem: config.oem,
        pdf_converter_command: config.pdfToPpmCommand,
        business_name: profile.business_name ?? null,
        applicant_name: profile.full_name ?? null,
        requested_amount: Number(application.requested_amount ?? 0),
        issue_date: issueDate,
      };

      return {
        text: tesseractResult.text,
        confidenceScore,
        detectedType,
        extractedFields,
        warnings: uniqueStrings(warnings),
        engine: "ocr",
      };
    },
  };
}

function buildGoogleVisionExtractor(
  profile: Profile,
  application: LoanApplication,
  config: GoogleVisionOcrConfig,
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
        const issues = storageContent.issues.length > 0
          ? storageContent.issues
          : ["Unable to load file bytes for OCR processing."];
        throw new Error(issues.join(" "));
      }

      const googleResult = await runGoogleVisionOcr({
        config,
        fileBytes: storageContent.bytes,
        mimeType: storageContent.detectedMimeType ?? input.mimeType,
        fileName: input.fileName,
      });

      const ocrTokens = tokenize(googleResult.text.slice(0, 12000));
      const combinedTokens = uniqueStrings([...fileTokens, ...ocrTokens]);
      const detection = detectDocumentTypeFromTokens(combinedTokens);
      const detectedType = detection.detectedType;
      const declaredType = normalizeText(input.declaredType);
      const detectedNormalized = detectedType ? normalizeText(detectedType) : null;
      const overlapCount = declaredTokens.filter((token) => combinedTokens.includes(token)).length;
      const overlapRatio = declaredTokens.length > 0 ? overlapCount / declaredTokens.length : 0;
      const typeMatched = detectedNormalized !== null && detectedNormalized === declaredType;

      let confidenceScore = googleResult.averageWordConfidence != null
        ? (googleResult.averageWordConfidence <= 1 ? googleResult.averageWordConfidence * 100 : googleResult.averageWordConfidence)
        : googleResult.text.length > 24
          ? 70
          : 35;

      if (!googleResult.text) {
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
      warnings.push(...googleResult.warnings);
      if (!googleResult.text) {
        warnings.push("OCR completed but no text content was extracted.");
      }
      if (!detectedType) {
        warnings.push("Document type could not be confidently inferred from OCR text.");
      }

      const issueDate = extractIssueDateFromText(googleResult.text, fileTokens);

      const extractedFields: Record<string, unknown> = {
        source: "google_vision",
        provider: "google_vision",
        provider_model_id: "DOCUMENT_TEXT_DETECTION",
        provider_api_version: "v1",
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
        page_count: googleResult.pageCount,
        line_count: googleResult.lineCount,
        word_count: googleResult.wordCount,
        average_word_confidence: googleResult.averageWordConfidence != null
          ? Number(((googleResult.averageWordConfidence <= 1
            ? googleResult.averageWordConfidence * 100
            : googleResult.averageWordConfidence)).toFixed(2))
          : null,
        min_word_confidence: googleResult.minWordConfidence != null
          ? Number(((googleResult.minWordConfidence <= 1
            ? googleResult.minWordConfidence * 100
            : googleResult.minWordConfidence)).toFixed(2))
          : null,
        languages: googleResult.languages,
        google_endpoint: config.endpoint,
        pdf_converter_command: config.pdfToPpmCommand,
        business_name: profile.business_name ?? null,
        applicant_name: profile.full_name ?? null,
        requested_amount: Number(application.requested_amount ?? 0),
        issue_date: issueDate,
      };

      return {
        text: googleResult.text,
        confidenceScore,
        detectedType,
        extractedFields,
        warnings: uniqueStrings(warnings),
        engine: "ocr",
      };
    },
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
  const googleConfig = getGoogleVisionOcrConfig();
  if (googleConfig) {
    return buildGoogleVisionExtractor(profile, application, googleConfig);
  }

  const tesseractConfig = getTesseractOcrConfig();
  if (tesseractConfig) {
    return buildTesseractExtractor(profile, application, tesseractConfig);
  }

  const azureConfig = getAzureOcrConfig();

  if (azureConfig) {
    return buildAzureDocumentIntelligenceExtractor(profile, application, azureConfig);
  }

  if (env.OCR_PROVIDER === "tesseract") {
    return buildPlaceholderExtractor(
      profile,
      application,
      "Tesseract OCR provider was selected but configuration is invalid. Falling back to placeholder verification.",
    );
  }

  if (env.OCR_PROVIDER === "azure_document_intelligence") {
    return buildPlaceholderExtractor(
      profile,
      application,
      "Azure OCR provider was selected but OCR_AZURE_ENDPOINT/OCR_AZURE_API_KEY are missing. Falling back to placeholder verification.",
    );
  }

  if (env.OCR_PROVIDER === "google_vision") {
    if (env.OCR_GOOGLE_API_KEY && !isLikelyGoogleApiKey(env.OCR_GOOGLE_API_KEY)) {
      return buildPlaceholderExtractor(
        profile,
        application,
        "Google OCR key format is invalid. Use a Cloud Vision API key starting with 'AIza'. Falling back to placeholder verification.",
      );
    }

    return buildPlaceholderExtractor(
      profile,
      application,
      "Google OCR provider was selected but OCR_GOOGLE_API_KEY is missing. Falling back to placeholder verification.",
    );
  }

  return buildPlaceholderExtractor(profile, application);
}

function buildAiCandidateTypes(input: {
  declaredType: string;
  extractedDetectedType: string | null;
  requiredTypes: Set<string>;
}): string[] {
  const rawCandidates = [
    input.declaredType,
    input.extractedDetectedType ?? "",
    ...Array.from(input.requiredTypes),
    ...Object.keys(DOCUMENT_TYPE_ALIASES),
  ];

  return uniqueStrings(
    rawCandidates
      .map((value) => canonicalizeDocumentType(value))
      .filter((value): value is string => value !== null),
  );
}

function parseGeminiCandidateContent(candidate: unknown): string {
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return "";
  }

  return candidate.content.parts
    .flatMap((part) => (isRecord(part) && typeof part.text === "string" ? [part.text] : []))
    .join("\n")
    .trim();
}

function parseAiClassification(content: string): AiTypeClassification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI response was not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("AI response JSON must be an object.");
  }

  const rawDetectedType = typeof parsed.detected_type === "string"
    ? parsed.detected_type.trim()
    : parsed.detected_type === null
      ? null
      : "";
  const normalizedDetectedType = rawDetectedType && rawDetectedType.toLowerCase() !== "unknown"
    ? canonicalizeDocumentType(rawDetectedType)
    : null;

  const rawConfidence = Number(parsed.confidence_score);
  const confidenceScore = Number.isFinite(rawConfidence)
    ? Number(Math.max(0, Math.min(99, rawConfidence)).toFixed(2))
    : 0;

  const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0
    ? parsed.reason.trim()
    : "No reason provided by AI classifier.";

  return {
    detectedType: normalizedDetectedType,
    confidenceScore,
    reason,
  };
}

async function classifyDocumentTypeWithGemini(input: {
  config: GeminiDocClassifierConfig;
  declaredType: string;
  fileName: string;
  ocrText: string;
  candidateTypes: string[];
}): Promise<AiTypeClassification> {
  const content = input.ocrText.slice(0, input.config.maxTextChars);
  const modelPath = encodeURIComponent(input.config.model);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=${encodeURIComponent(input.config.apiKey)}`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You classify SME loan supporting documents using OCR text.",
              "Return strict JSON with keys: detected_type, confidence_score, reason.",
              "detected_type must be one of candidate types or null.",
              "confidence_score must be 0..99.",
            ].join(" "),
          }],
        },
        contents: [
          {
            role: "user",
            parts: [{
              text: JSON.stringify({
                declared_type: input.declaredType,
                file_name: input.fileName,
                candidate_types: input.candidateTypes,
                ocr_text: content,
              }),
            }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
    input.config.timeoutMs,
  );

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const remoteMessage = extractNestedErrorMessage(payload);
    throw new Error(
      `AI classifier request failed (${response.status})${remoteMessage ? `: ${remoteMessage}` : ""}`,
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new Error("AI classifier response did not contain candidates.");
  }

  const firstCandidate = payload.candidates[0];
  const contentText = parseGeminiCandidateContent(firstCandidate);
  if (!contentText) {
    throw new Error("AI classifier returned empty content.");
  }

  const result = parseAiClassification(contentText);
  const candidateSet = new Set(input.candidateTypes.map((type) => canonicalizeDocumentType(type)).filter((type): type is string => type !== null));

  if (result.detectedType && candidateSet.size > 0 && !candidateSet.has(result.detectedType) && result.confidenceScore < 85) {
    return {
      ...result,
      detectedType: null,
      reason: `${result.reason} Detected type was outside candidate types and confidence was below 85.`,
    };
  }

  return result;
}

async function applyAiTypeEnhancement(input: {
  extracted: ExtractedDocument;
  declaredType: string;
  fileName: string;
  requiredTypes: Set<string>;
}): Promise<ExtractedDocument> {
  const config = getGeminiDocClassifierConfig();
  if (!config) {
    return input.extracted;
  }

  if (input.extracted.engine !== "ocr") {
    return {
      ...input.extracted,
      extractedFields: {
        ...input.extracted.extractedFields,
        ai_classifier: {
          provider: "gemini",
          enabled: false,
          skipped: true,
          reason: "OCR engine is not active for this document.",
        },
      },
    };
  }

  const trimmedText = input.extracted.text.trim();
  if (trimmedText.length < config.minOcrChars) {
    return {
      ...input.extracted,
      extractedFields: {
        ...input.extracted.extractedFields,
        ai_classifier: {
          provider: "gemini",
          enabled: false,
          skipped: true,
          reason: `OCR text is too short for AI classification (min ${config.minOcrChars} chars).`,
        },
      },
    };
  }

  const candidateTypes = buildAiCandidateTypes({
    declaredType: input.declaredType,
    extractedDetectedType: input.extracted.detectedType,
    requiredTypes: input.requiredTypes,
  });

  try {
    const aiResult = await classifyDocumentTypeWithGemini({
      config,
      declaredType: input.declaredType,
      fileName: input.fileName,
      ocrText: trimmedText,
      candidateTypes,
    });

    const heuristicType = input.extracted.detectedType;
    const heuristicConfidence = input.extracted.confidenceScore;
    let resolvedType = heuristicType;
    let resolvedConfidence = heuristicConfidence;
    const warnings = [...input.extracted.warnings];

    if (aiResult.detectedType) {
      if (!heuristicType) {
        resolvedType = aiResult.detectedType;
        resolvedConfidence = Math.max(heuristicConfidence, aiResult.confidenceScore);
      } else if (areEquivalentDocumentTypes(aiResult.detectedType, heuristicType)) {
        resolvedType = canonicalizeDocumentType(aiResult.detectedType) ?? heuristicType;
        resolvedConfidence = Math.max(heuristicConfidence, aiResult.confidenceScore);
      } else if (aiResult.confidenceScore >= heuristicConfidence + 12 || aiResult.confidenceScore >= 85) {
        warnings.push(
          `AI classifier overrode detected type from '${heuristicType}' to '${aiResult.detectedType}' (confidence ${aiResult.confidenceScore}).`,
        );
        resolvedType = aiResult.detectedType;
        resolvedConfidence = aiResult.confidenceScore;
      } else {
        warnings.push(
          `AI classifier suggested '${aiResult.detectedType}' but heuristic result '${heuristicType}' was retained due to lower confidence.`,
        );
      }
    }

    return {
      ...input.extracted,
      detectedType: resolvedType,
      confidenceScore: Number(Math.max(0, Math.min(99, resolvedConfidence)).toFixed(2)),
      warnings: uniqueStrings(warnings),
      extractedFields: {
        ...input.extracted.extractedFields,
        detected_document_type: resolvedType,
        ai_classifier: {
          provider: "gemini",
          enabled: true,
          model: config.model,
          candidate_types: candidateTypes,
          detected_type: aiResult.detectedType,
          confidence_score: aiResult.confidenceScore,
          reason: aiResult.reason,
          resolved_detected_type: resolvedType,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI classification error";
    return {
      ...input.extracted,
      warnings: uniqueStrings([
        ...input.extracted.warnings,
        `AI classification skipped: ${message}`,
      ]),
      extractedFields: {
        ...input.extracted.extractedFields,
        ai_classifier: {
          provider: "gemini",
          enabled: false,
          failed: true,
          model: config.model,
          reason: message,
        },
      },
    };
  }
}

function buildRequiredDocumentRuleMap(rows: Array<Record<string, unknown>>): Map<string, RequiredDocumentRuleDefinition> {
  const map = new Map<string, RequiredDocumentRuleDefinition>();

  for (const row of rows) {
    const documentType = String(row.document_type ?? "").trim();
    if (!documentType) {
      continue;
    }

    const ruleDefinition: RequiredDocumentRuleDefinition = {
      documentType: normalizeText(documentType),
      displayName: String(row.display_name ?? documentType).trim() || documentType,
      isRequired: Boolean(row.is_required ?? true),
      rules: parseDocumentVerificationRules(row.verification_rules_json),
    };

    const keys = uniqueStrings([
      normalizeText(documentType),
      canonicalizeDocumentType(documentType) ?? "",
    ]);

    for (const key of keys) {
      map.set(key, ruleDefinition);
    }
  }

  return map;
}

function getRuleDefinitionForDocumentType(
  map: Map<string, RequiredDocumentRuleDefinition>,
  declaredType: string,
): RequiredDocumentRuleDefinition | null {
  const normalized = normalizeText(declaredType);
  const canonical = canonicalizeDocumentType(declaredType);
  return map.get(normalized) ?? (canonical ? map.get(canonical) ?? null : null);
}

function evaluateDeterministicRuleChecks(input: {
  ocrText: string;
  rules: DocumentVerificationRules;
}): {
  status: ScanValidationStatus;
  notes: string[];
  missingRequiredKeywords: string[];
  forbiddenKeywordsFound: string[];
} {
  const notes: string[] = [];
  const normalizedText = normalizeTextForSearch(input.ocrText);
  const missingRequiredKeywords = input.rules.requiredKeywords.filter((keyword) => !normalizedText.includes(keyword));
  const forbiddenKeywordsFound = input.rules.forbiddenKeywords.filter((keyword) => normalizedText.includes(keyword));

  if (missingRequiredKeywords.length > 0) {
    notes.push(`Missing required keywords: ${missingRequiredKeywords.join(", ")}.`);
  } else if (input.rules.requiredKeywords.length > 0) {
    notes.push("All required keywords were detected.");
  }

  if (forbiddenKeywordsFound.length > 0) {
    notes.push(`Forbidden keywords detected: ${forbiddenKeywordsFound.join(", ")}.`);
  } else if (input.rules.forbiddenKeywords.length > 0) {
    notes.push("No forbidden keywords were detected.");
  }

  if (input.rules.minTextLength !== null) {
    if (input.ocrText.trim().length < input.rules.minTextLength) {
      notes.push(`OCR text length is below minimum rule (${input.rules.minTextLength} chars).`);
    } else {
      notes.push(`OCR text length meets minimum rule (${input.rules.minTextLength} chars).`);
    }
  }

  if (missingRequiredKeywords.length > 0 || forbiddenKeywordsFound.length > 0) {
    return {
      status: "invalid",
      notes,
      missingRequiredKeywords,
      forbiddenKeywordsFound,
    };
  }

  if (input.rules.minTextLength !== null && input.ocrText.trim().length < input.rules.minTextLength) {
    return {
      status: "unclear",
      notes,
      missingRequiredKeywords,
      forbiddenKeywordsFound,
    };
  }

  if (!hasDocumentVerificationRules(input.rules)) {
    return {
      status: "unclear",
      notes: [...notes, "No verification rules were configured for this document type."],
      missingRequiredKeywords,
      forbiddenKeywordsFound,
    };
  }

  if (input.rules.aiInstructions && input.rules.requiredKeywords.length === 0 && input.rules.forbiddenKeywords.length === 0 && input.rules.minTextLength === null) {
    return {
      status: "unclear",
      notes: [...notes, "Only AI instructions are configured; deterministic verification is inconclusive."],
      missingRequiredKeywords,
      forbiddenKeywordsFound,
    };
  }

  return {
    status: "valid",
    notes,
    missingRequiredKeywords,
    forbiddenKeywordsFound,
  };
}

function parseAiRuleVerification(content: string): AiRuleVerification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI rule verification response was not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("AI rule verification JSON must be an object.");
  }

  const rawStatus = typeof parsed.status === "string" ? normalizeText(parsed.status) : "";
  const status: ScanValidationStatus = rawStatus === "valid" || rawStatus === "invalid" || rawStatus === "unclear"
    ? rawStatus
    : "unclear";

  const rawConfidence = Number(parsed.confidence_score);
  const confidenceScore = Number.isFinite(rawConfidence)
    ? Number(Math.max(0, Math.min(99, rawConfidence)).toFixed(2))
    : 0;

  const reasons = Array.isArray(parsed.reasons)
    ? uniqueStrings(parsed.reasons.map((reason) => String(reason)))
    : [];

  return {
    status,
    confidenceScore,
    reasons,
    missingRequiredKeywords: parseRuleKeywords(parsed.missing_required_keywords),
    forbiddenKeywordsFound: parseRuleKeywords(parsed.forbidden_keywords_found),
  };
}

async function verifyDocumentRulesWithGemini(input: {
  config: GeminiDocClassifierConfig;
  declaredType: string;
  fileName: string;
  ocrText: string;
  rules: DocumentVerificationRules;
}): Promise<AiRuleVerification> {
  const content = input.ocrText.slice(0, input.config.maxTextChars);
  const modelPath = encodeURIComponent(input.config.model);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=${encodeURIComponent(input.config.apiKey)}`;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You verify whether OCR text satisfies document verification rules for SME loan processing.",
              "Return strict JSON only with keys: status, confidence_score, reasons, missing_required_keywords, forbidden_keywords_found.",
              "status must be one of: valid, invalid, unclear.",
              "confidence_score must be in range 0..99.",
              "Use invalid when rules are clearly violated, valid when rules are satisfied, unclear when OCR evidence is insufficient.",
            ].join(" "),
          }],
        },
        contents: [
          {
            role: "user",
            parts: [{
              text: JSON.stringify({
                declared_type: input.declaredType,
                file_name: input.fileName,
                verification_rules: {
                  required_keywords: input.rules.requiredKeywords,
                  forbidden_keywords: input.rules.forbiddenKeywords,
                  min_text_length: input.rules.minTextLength,
                  ai_instructions: input.rules.aiInstructions,
                },
                ocr_text: content,
              }),
            }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
    input.config.timeoutMs,
  );

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const remoteMessage = extractNestedErrorMessage(payload);
    throw new Error(`AI rule verification request failed (${response.status})${remoteMessage ? `: ${remoteMessage}` : ""}`);
  }

  if (!isRecord(payload) || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new Error("AI rule verification response did not contain candidates.");
  }

  const contentText = parseGeminiCandidateContent(payload.candidates[0]);
  if (!contentText) {
    throw new Error("AI rule verification returned empty content.");
  }

  return parseAiRuleVerification(contentText);
}

async function applyDocumentRuleVerification(input: {
  extracted: ExtractedDocument;
  declaredType: string;
  fileName: string;
  ruleDefinition: RequiredDocumentRuleDefinition | null;
}): Promise<DocumentRuleVerificationResult | null> {
  if (!input.ruleDefinition || !hasDocumentVerificationRules(input.ruleDefinition.rules)) {
    return null;
  }

  const rules = input.ruleDefinition.rules;
  const deterministic = evaluateDeterministicRuleChecks({
    ocrText: input.extracted.text,
    rules,
  });

  let status = deterministic.status;
  let confidenceScore = status === "valid" ? 80 : status === "unclear" ? 55 : 30;
  const notes = [
    `Applied verification rules for '${input.ruleDefinition.displayName}'.`,
    ...deterministic.notes,
  ];
  let aiVerification: AiRuleVerification | null = null;

  const config = getGeminiDocClassifierConfig();
  const trimmedText = input.extracted.text.trim();

  if (!config) {
    notes.push("Gemini verification is disabled; rule evaluation used deterministic checks only.");
  } else if (input.extracted.engine !== "ocr") {
    notes.push("Gemini verification skipped because OCR engine is not active.");
  } else if (trimmedText.length < config.minOcrChars) {
    notes.push(`Gemini verification skipped because OCR text is too short (min ${config.minOcrChars} chars).`);
  } else {
    try {
      aiVerification = await verifyDocumentRulesWithGemini({
        config,
        declaredType: input.declaredType,
        fileName: input.fileName,
        ocrText: trimmedText,
        rules,
      });

      confidenceScore = Math.max(confidenceScore, aiVerification.confidenceScore);

      if (aiVerification.status === "invalid") {
        status = "invalid";
      } else if (status !== "invalid" && aiVerification.status === "valid") {
        status = "valid";
      } else if (status !== "invalid" && aiVerification.status === "unclear") {
        status = "unclear";
      }

      if (aiVerification.reasons.length > 0) {
        notes.push(...aiVerification.reasons.map((reason) => `Gemini: ${reason}`));
      }
      if (aiVerification.missingRequiredKeywords.length > 0) {
        notes.push(`Gemini missing required keywords: ${aiVerification.missingRequiredKeywords.join(", ")}.`);
      }
      if (aiVerification.forbiddenKeywordsFound.length > 0) {
        notes.push(`Gemini detected forbidden keywords: ${aiVerification.forbiddenKeywordsFound.join(", ")}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini verification error";
      notes.push(`Gemini rule verification skipped: ${message}`);
    }
  }

  return {
    status,
    confidenceScore: Number(Math.max(0, Math.min(99, confidenceScore)).toFixed(2)),
    notes: uniqueStrings(notes),
    details: {
      document_type: input.ruleDefinition.documentType,
      display_name: input.ruleDefinition.displayName,
      rules,
      deterministic: {
        status: deterministic.status,
        missing_required_keywords: deterministic.missingRequiredKeywords,
        forbidden_keywords_found: deterministic.forbiddenKeywordsFound,
      },
      ai_verification: aiVerification
        ? {
            provider: "gemini",
            model: config?.model ?? null,
            status: aiVerification.status,
            confidence_score: aiVerification.confidenceScore,
            reasons: aiVerification.reasons,
            missing_required_keywords: aiVerification.missingRequiredKeywords,
            forbidden_keywords_found: aiVerification.forbiddenKeywordsFound,
          }
        : {
            provider: "gemini",
            enabled: false,
          },
    },
  };
}

function mergeValidationWithRuleResult(input: {
  baseValidation: { status: ScanValidationStatus; notes: string[] };
  ruleResult: DocumentRuleVerificationResult | null;
}): { status: ScanValidationStatus; notes: string[] } {
  if (!input.ruleResult) {
    return input.baseValidation;
  }

  const notes = uniqueStrings([...input.baseValidation.notes, ...input.ruleResult.notes]);

  if (input.baseValidation.status === "invalid" || input.ruleResult.status === "invalid") {
    return {
      status: "invalid",
      notes,
    };
  }

  if (input.ruleResult.status === "valid") {
    return {
      status: "valid",
      notes,
    };
  }

  return {
    status: "unclear",
    notes,
  };
}

function isDocumentTypeRequiredForBank(requiredTypes: Set<string>, declaredType: string): boolean {
  if (requiredTypes.size === 0) {
    return true;
  }

  for (const requiredType of requiredTypes) {
    if (normalizeText(requiredType) === normalizeText(declaredType) || areEquivalentDocumentTypes(requiredType, declaredType)) {
      return true;
    }
  }

  return false;
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
  const requiredForBank = isDocumentTypeRequiredForBank(input.requiredTypes, declaredType);

  if (input.requiredTypes.size === 0) {
    notes.push("No selected bank checklist found; only file-level verification was performed.");
  } else if (!requiredForBank) {
    notes.push("Document type is not listed in selected bank's required checklist.");
    return {
      status: "invalid",
      notes,
    };
  } else {
    notes.push("Document type matches selected bank checklist.");
  }

  if (detectedType && !areEquivalentDocumentTypes(detectedType, declaredType)) {
    notes.push(`Detected document type (${detectedType}) differs from declared type (${declaredType}).`);
    return {
      status: "invalid",
      notes,
    };
  }

  if (!detectedType) {
    notes.push("Document type could not be confidently inferred from OCR evidence.");
    if (input.requiredTypes.size === 0) {
      notes.push("Without selected bank checklist and without type evidence, the document is treated as invalid.");
      return {
        status: "invalid",
        notes,
      };
    }
    if (input.confidenceScore >= 75) {
      notes.push("OCR confidence is high, but confidence alone cannot validate document authenticity.");
    }
    return {
      status: "unclear",
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

function getDocumentWorkflowStatus(_status: ScanValidationStatus): "verified" | "rejected" | "needs_review" {
  // Scanner classifications are advisory; human review is required before final workflow state.
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
        .select("document_type, display_name, is_required, verification_rules_json")
        .eq("product_id", selectedProductId)
    : { data: [], error: null };

  if (requiredDocsResult.error) {
    throw internalError("Failed to load selected bank requirements", requiredDocsResult.error);
  }

  const requiredDocRows = ((requiredDocsResult.data ?? []) as Array<Record<string, unknown>>);
  const requiredTypes = new Set(
    requiredDocRows
      .filter((row) => Boolean(row.is_required ?? true))
      .map((row) => normalizeText(String(row.document_type))),
  );
  const requiredDocRuleMap = buildRequiredDocumentRuleMap(requiredDocRows);

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
        const extractedWithAi = await applyAiTypeEnhancement({
          extracted,
          declaredType: String(row.document_type),
          fileName: String(row.file_name),
          requiredTypes,
        });
        const ruleDefinition = getRuleDefinitionForDocumentType(requiredDocRuleMap, String(row.document_type));
        const ruleVerification = await applyDocumentRuleVerification({
          extracted: extractedWithAi,
          declaredType: String(row.document_type),
          fileName: String(row.file_name),
          ruleDefinition,
        });

        const baseValidation = evaluateDocumentValidation({
          declaredType: String(row.document_type),
          detectedType: extractedWithAi.detectedType,
          confidenceScore: extractedWithAi.confidenceScore,
          requiredTypes,
        });
        const validation = mergeValidationWithRuleResult({
          baseValidation,
          ruleResult: ruleVerification,
        });

        validationStatus = validation.status;
        detectedDocType = extractedWithAi.detectedType;
        notes = uniqueStrings([...validation.notes, ...extractedWithAi.warnings]);
        extractedFields = {
          ...extractedWithAi.extractedFields,
          rule_verification: ruleVerification?.details ?? null,
          confidence_score: Math.max(extractedWithAi.confidenceScore, ruleVerification?.confidenceScore ?? 0),
          extraction_engine: extractedWithAi.engine,
          scanned_at: new Date().toISOString(),
        };
        ocrText = extractedWithAi.text;
        confidenceScore = Math.max(extractedWithAi.confidenceScore, ruleVerification?.confidenceScore ?? 0);

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
        const safeErrorMessage = sanitizeScanErrorMessage(errorMessage);

        validationStatus = "unclear";
        detectedDocType = row.detected_doc_type ? String(row.detected_doc_type) : null;
        extractedFields = {
          ...existingExtracted,
          confidence_score: 0,
          extraction_engine: env.OCR_PROVIDER === "placeholder" ? "placeholder" : "ocr",
          configured_ocr_provider: env.OCR_PROVIDER,
          scan_error: {
            message: safeErrorMessage,
            at: new Date().toISOString(),
          },
        };
        ocrText = row.ocr_text ? String(row.ocr_text) : null;
        confidenceScore = 0;
        notes = [
          "Document scan could not be completed for this file.",
          "Manual review is required.",
          `Scan error: ${safeErrorMessage}`,
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

      if (String(row.status ?? "").toLowerCase() !== "needs_review") {
        const updateDocument = await supabaseAdmin
          .from("documents")
          .update({
            status: "needs_review",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateDocument.error) {
          throw internalError("Failed to persist document review status", updateDocument.error);
        }
      }
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
