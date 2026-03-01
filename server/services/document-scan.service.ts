
import { env } from "../config/env";
import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";
import { checkDocumentCompleteness } from "./document.service";
import { aiService } from "./ai.service";
import type { LoanApplication, Profile } from "../../types/domain";
import type {
  ExtractedDocument,
  ScanValidationStatus,
  OcrExtractor,
  AiTypeClassification,
} from "./ocr/ocr.types";
import {
  normalizeText,
  uniqueStrings,
  truncateText,
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

type DiscrepancySeverity = "minor" | "critical";
type DiscrepancySource = "ocr" | "rule" | "cross_document" | "system_record" | "ai";
type FinalVerificationStatus = "Verified" | "Needs Review" | "Rejected";

type DiscrepancyItem = {
  code: string;
  field: string;
  extracted_value: unknown;
  expected_value: unknown;
  difference: string;
  severity: DiscrepancySeverity;
  confidence_score: number;
  source: DiscrepancySource;
};

type VerificationRuleConfig = {
  required_keywords: string[];
  forbidden_keywords: string[];
  min_text_length: number | null;
  ai_instructions: string | null;
};

type RequiredDocumentRule = {
  product_id: string | null;
  document_type: string;
  display_name: string;
  required: boolean;
  verification_rules: VerificationRuleConfig;
};

type DocumentDbRow = {
  id: string;
  application_id: string;
  user_id: string;
  product_id: string | null;
  document_type: string;
  file_name: string;
  storage_bucket: string | null;
  storage_path: string;
  mime_type: string | null;
  extracted_json: Record<string, unknown>;
  validation_status: string | null;
  detected_doc_type: string | null;
  ocr_text: string | null;
  status: string | null;
  created_at: string;
};

type WorkingDocument = {
  row: DocumentDbRow;
  declaredType: string;
  declaredTypeCanonical: string;
  requiredRule: RequiredDocumentRule | null;
  requiredTypes: string[];
  extractedText: string;
  detectedType: string | null;
  detectedTypeCanonical: string | null;
  confidenceScore: number;
  extractedFields: Record<string, unknown>;
  warnings: string[];
  notes: string[];
  scanned: boolean;
  scanError: string | null;
  classifier: AiTypeClassification | null;
};

type DocumentDiscrepancyReport = {
  ocr_extracted_values: Record<string, unknown>;
  expected_values: Record<string, unknown>;
  detected_differences: DiscrepancyItem[];
  missing_fields: string[];
  confidence_scores: {
    ocr_confidence: number;
    type_detection_confidence: number;
    overall_verification_confidence: number;
  };
  type_comparison: {
    expected_document_type: string;
    detected_document_type: string | null;
    matched: boolean;
  };
};

type AiDiscrepancySummary = {
  summary: string;
  significance: "none" | "minor" | "critical";
  minor_discrepancies: number;
  critical_discrepancies: number;
  recommended_status: FinalVerificationStatus;
  source: "rule_engine" | "gemini";
};

type ScanDocumentSummary = {
  document_id: string;
  document_type: string;
  expected_document_type: string;
  file_name: string;
  detected_doc_type: string | null;
  validation_status: ScanValidationStatus;
  final_verification_status: FinalVerificationStatus;
  confidence_score: number;
  notes: string[];
  extracted_fields: Record<string, unknown>;
  ocr_preview: string | null;
  discrepancy_report: DocumentDiscrepancyReport;
  ai_discrepancy_summary: AiDiscrepancySummary;
  scanned: boolean;
};

type EvaluatedDocument = {
  row: DocumentDbRow;
  summary: ScanDocumentSummary;
  validationStatus: ScanValidationStatus;
  workflowStatus: string;
  detectedDocType: string | null;
  extractedFieldsToStore: Record<string, unknown>;
  ocrText: string;
};

type RuleVerificationResult = {
  notes: string[];
  discrepancies: DiscrepancyItem[];
} | null;

type ConsensusContext = {
  byField: Record<string, string>;
  conflicts: Record<string, string[]>;
};

const DOCUMENT_TYPE_LIBRARY: Array<{
  canonical: string;
  aliases: string[];
  keywords: string[];
}> = [
  {
    canonical: "nic",
    aliases: ["nic", "national_id", "national_identity_card", "id_card", "identity_card"],
    keywords: ["national identity card", "identity card", "nic", "sri lanka", "date of birth"],
  },
  {
    canonical: "passport",
    aliases: ["passport", "travel_document"],
    keywords: ["passport", "passport no", "nationality", "place of birth", "date of issue"],
  },
  {
    canonical: "invoice",
    aliases: ["invoice", "tax_invoice", "bill"],
    keywords: ["invoice", "invoice no", "bill to", "amount due", "subtotal"],
  },
  {
    canonical: "certificate",
    aliases: ["certificate", "cert"],
    keywords: ["certificate", "issued on", "issuer", "certified"],
  },
  {
    canonical: "bank_statement",
    aliases: ["bank_statement", "statement"],
    keywords: ["bank statement", "account number", "transaction", "balance", "statement period"],
  },
  {
    canonical: "business_registration",
    aliases: ["business_registration", "registration_certificate", "br", "business_registration_certificate"],
    keywords: ["certificate of registration", "registration number", "registrar", "company", "business"],
  },
  {
    canonical: "utility_bill",
    aliases: ["utility_bill", "address_proof"],
    keywords: ["utility", "billing address", "account number", "invoice", "due date"],
  },
  {
    canonical: "tin_tax",
    aliases: ["tin_tax", "tin", "tax_document"],
    keywords: ["tin", "tax", "inland revenue", "taxpayer"],
  },
  {
    canonical: "financial_statements",
    aliases: ["financial_statements", "financial_statement", "balance_sheet"],
    keywords: ["statement of financial position", "profit", "financial year", "assets", "liabilities"],
  },
  {
    canonical: "form_20",
    aliases: ["form_20"],
    keywords: ["form 20", "director", "companies act", "registrar"],
  },
  {
    canonical: "form_1",
    aliases: ["form_1"],
    keywords: ["form 1", "incorporation", "registrar", "company"],
  },
  {
    canonical: "collateral_deed",
    aliases: ["collateral_deed", "deed", "property_deed"],
    keywords: ["deed", "property", "title", "land", "owner"],
  },
];
const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  nic: ["full_name", "nic_number", "date_of_birth"],
  passport: ["full_name", "passport_number", "issue_date"],
  invoice: ["invoice_number", "issue_date", "amount"],
  certificate: ["certificate_number", "issue_date"],
  bank_statement: ["account_number", "issue_date"],
  business_registration: ["business_name", "registration_number", "issue_date"],
  utility_bill: ["address", "account_number", "issue_date"],
  tin_tax: ["tin_number", "issue_date"],
  financial_statements: ["issue_date"],
  form_20: ["registration_number", "issue_date"],
  form_1: ["registration_number", "issue_date"],
  collateral_deed: ["owner_name", "issue_date"],
};

const CRITICAL_FIELDS = new Set([
  "nic_number",
  "passport_number",
  "registration_number",
  "tin_number",
  "account_number",
  "invoice_number",
  "certificate_number",
]);

const CONSISTENCY_FIELDS = [
  "full_name",
  "business_name",
  "nic_number",
  "passport_number",
  "registration_number",
  "tin_number",
  "account_number",
  "address",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function normalizedComparable(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canonicalizeDocumentType(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeKey(value);

  for (const entry of DOCUMENT_TYPE_LIBRARY) {
    if (entry.canonical === normalized) return entry.canonical;
    if (entry.aliases.includes(normalized)) return entry.canonical;
  }

  return normalized || null;
}

function isKnownDocumentType(value: string): boolean {
  const canonical = canonicalizeDocumentType(value);
  if (!canonical) return false;
  return DOCUMENT_TYPE_LIBRARY.some((entry) => entry.canonical === canonical);
}

function textFingerprint(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 400);
}

function isDocumentTypeMatch(expected: string, detected: string): boolean {
  const expectedCanonical = canonicalizeDocumentType(expected);
  const detectedCanonical = canonicalizeDocumentType(detected);
  if (!expectedCanonical || !detectedCanonical) return false;
  return expectedCanonical === detectedCanonical;
}

function getDocumentWorkflowStatus(status: ScanValidationStatus): string {
  if (status === "valid") return "verified";
  if (status === "invalid") return "rejected";
  return "needs_review";
}

function toFinalVerificationStatus(status: ScanValidationStatus): FinalVerificationStatus {
  if (status === "valid") return "Verified";
  if (status === "invalid") return "Rejected";
  return "Needs Review";
}

function sanitizeScanErrorMessage(message: string): string {
  const isProduction = env.NODE_ENV === "production";
  if (!isProduction) return message;

  if (message.toLowerCase().includes("timeout")) {
    return "The document scan timed out. Please try again.";
  }
  if (message.toLowerCase().includes("memory")) {
    return "System resource error during scan. Please try again.";
  }
  return "An unexpected error occurred during document scanning.";
}

function detectDocumentTypeFromTokens(tokens: string[]): { detectedType: string | null; score: number; matchedKeywords: string[] } {
  const normalizedTokens = tokens.map((token) => normalizeText(token));
  const tokenSet = new Set(normalizedTokens);
  const joined = ` ${normalizedTokens.join(" ")} `;

  let best: { detectedType: string | null; score: number; matchedKeywords: string[] } = {
    detectedType: null,
    score: 0,
    matchedKeywords: [],
  };

  for (const entry of DOCUMENT_TYPE_LIBRARY) {
    const matches: string[] = [];
    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      const keywordTokens = normalizedKeyword.split(" ").filter(Boolean);
      const matched = keywordTokens.length === 1
        ? tokenSet.has(keywordTokens[0])
        : joined.includes(` ${normalizedKeyword} `);

      if (matched) {
        matches.push(keyword);
      }
    }

    if (matches.length === 0) continue;

    const score = (matches.length / entry.keywords.length) * 100;
    if (score > best.score) {
      best = {
        detectedType: entry.canonical,
        score: rounded(score),
        matchedKeywords: matches,
      };
    }
  }

  if (best.score < 20) {
    return {
      detectedType: null,
      score: best.score,
      matchedKeywords: best.matchedKeywords,
    };
  }

  return best;
}

function extractIssueDateFromText(text: string, _tokens: string[]): string | null {
  const source = text || "";
  if (!source) return null;

  const issueLabelMatch = source.match(
    /\b(?:date of issue|issued on|issue date)\s*[:\-]?\s*([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.][0-1]?\d[\/\-.][0-3]?\d|[A-Za-z]{3,9}\s+[0-3]?\d,\s*(?:19|20)\d{2})/i,
  );
  if (issueLabelMatch?.[1]) {
    return issueLabelMatch[1].trim();
  }

  const genericMatch = source.match(
    /\b([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.][0-1]?\d[\/\-.][0-3]?\d|[A-Za-z]{3,9}\s+[0-3]?\d,\s*(?:19|20)\d{2})\b/i,
  );
  return genericMatch?.[1]?.trim() ?? null;
}

function extractFirst(source: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].trim();
      if (candidate.length > 0) return candidate;
    }
  }
  return null;
}

function extractKeyFieldsFromText(text: string): Record<string, unknown> {
  const source = text || "";
  if (!source.trim()) {
    return {};
  }

  const result: Record<string, unknown> = {};

  const fullName = extractFirst(source, [
    /\b(?:full name|name|customer name|applicant name|holder name)\s*[:\-]\s*([A-Za-z][A-Za-z\s.'-]{2,100})/i,
  ]);
  if (fullName) result.full_name = fullName;

  const businessName = extractFirst(source, [
    /\b(?:business name|company name|registered name)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\s.'&,-]{2,120})/i,
  ]);
  if (businessName) result.business_name = businessName;

  const ownerName = extractFirst(source, [
    /\b(?:owner name|proprietor|registered owner)\s*[:\-]\s*([A-Za-z][A-Za-z\s.'-]{2,100})/i,
  ]);
  if (ownerName) result.owner_name = ownerName;

  const address = extractFirst(source, [
    /\b(?:address|billing address|residential address)\s*[:\-]\s*([^\n]{8,180})/i,
  ]);
  if (address) result.address = address;

  const nicNumber = extractFirst(source, [
    /\b(\d{9}[VvXx])\b/,
    /\b(\d{12})\b/,
  ]);
  if (nicNumber) result.nic_number = nicNumber;
  const passportNumber = extractFirst(source, [
    /\bpassport(?:\s*(?:no|number|#))?\s*[:\-]?\s*([A-Z0-9]{6,12})\b/i,
    /\b([A-Z]{1,2}\d{6,8})\b/,
  ]);
  if (passportNumber) result.passport_number = passportNumber;

  const registrationNumber = extractFirst(source, [
    /\b(?:registration(?:\s*(?:no|number|#))?|reg(?:\s*(?:no|number|#))?)\s*[:\-]?\s*([A-Z0-9\-\/]{4,30})\b/i,
  ]);
  if (registrationNumber) result.registration_number = registrationNumber;

  const invoiceNumber = extractFirst(source, [
    /\b(?:invoice(?:\s*(?:no|number|#))?|inv(?:\s*(?:no|number|#))?)\s*[:\-]?\s*([A-Z0-9\-\/]{3,30})\b/i,
  ]);
  if (invoiceNumber) result.invoice_number = invoiceNumber;

  const certificateNumber = extractFirst(source, [
    /\b(?:certificate(?:\s*(?:no|number|#))?|cert(?:\s*(?:no|number|#))?)\s*[:\-]?\s*([A-Z0-9\-\/]{3,30})\b/i,
  ]);
  if (certificateNumber) result.certificate_number = certificateNumber;

  const tinNumber = extractFirst(source, [
    /\b(?:tin|tax(?:\s*identification)?(?:\s*number)?)(?:\s*(?:no|number|#))?\s*[:\-]?\s*([A-Z0-9\-]{4,30})\b/i,
  ]);
  if (tinNumber) result.tin_number = tinNumber;

  const accountNumber = extractFirst(source, [
    /\b(?:account(?:\s*(?:no|number|#))?)\s*[:\-]?\s*([0-9Xx\-]{6,30})\b/i,
  ]);
  if (accountNumber) result.account_number = accountNumber;

  const amount = extractFirst(source, [
    /\b(?:total amount|amount due|amount|total)\s*[:\-]?\s*(?:rs\.?|lkr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\b/i,
  ]);
  if (amount) {
    const numeric = Number(amount.replace(/,/g, ""));
    result.amount = Number.isFinite(numeric) ? rounded(numeric, 2) : amount;
  }

  const dateOfBirth = extractFirst(source, [
    /\b(?:date of birth|dob)\s*[:\-]?\s*([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.][0-1]?\d[\/\-.][0-3]?\d|[A-Za-z]{3,9}\s+[0-3]?\d,\s*(?:19|20)\d{2})/i,
  ]);
  if (dateOfBirth) result.date_of_birth = dateOfBirth;

  const issueDate = extractIssueDateFromText(source, []);
  if (issueDate) result.issue_date = issueDate;

  const expiryDate = extractFirst(source, [
    /\b(?:date of expiry|expires on|expiry date|valid until)\s*[:\-]?\s*([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.][0-1]?\d[\/\-.][0-3]?\d|[A-Za-z]{3,9}\s+[0-3]?\d,\s*(?:19|20)\d{2})/i,
  ]);
  if (expiryDate) result.expiry_date = expiryDate;

  return result;
}

function parseVerificationRules(value: unknown): VerificationRuleConfig {
  const record = toRecord(value);
  const required_keywords = Array.isArray(record.required_keywords)
    ? uniqueStrings(record.required_keywords.map((item) => normalizeText(String(item))))
    : [];
  const forbidden_keywords = Array.isArray(record.forbidden_keywords)
    ? uniqueStrings(record.forbidden_keywords.map((item) => normalizeText(String(item))))
    : [];
  const minTextLengthRaw = toNumber(record.min_text_length, -1);
  const min_text_length = minTextLengthRaw >= 0 ? Math.round(minTextLengthRaw) : null;
  const ai_instructions = toStringOrNull(record.ai_instructions);

  return {
    required_keywords,
    forbidden_keywords,
    min_text_length,
    ai_instructions,
  };
}

function requiredFieldsForType(declaredCanonical: string, detectedCanonical: string | null): string[] {
  const declaredFields = REQUIRED_FIELDS_BY_TYPE[declaredCanonical] ?? [];
  if (declaredFields.length > 0) {
    return declaredFields;
  }
  if (detectedCanonical) {
    return REQUIRED_FIELDS_BY_TYPE[detectedCanonical] ?? [];
  }
  return [];
}

function mergeExtractedFields(base: Record<string, unknown>, additions: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    merged[key] = value;
  }
  return merged;
}

function valuesMatch(field: string, left: unknown, right: unknown): boolean {
  const a = toStringOrNull(left);
  const b = toStringOrNull(right);
  if (!a || !b) return false;

  if (CRITICAL_FIELDS.has(field)) {
    return normalizedComparable(a) === normalizedComparable(b);
  }

  const normalizedA = normalizedComparable(a);
  const normalizedB = normalizedComparable(b);
  if (normalizedA === normalizedB) return true;
  if (normalizedA.length >= 5 && normalizedB.includes(normalizedA)) return true;
  if (normalizedB.length >= 5 && normalizedA.includes(normalizedB)) return true;
  return false;
}

function makeDiscrepancy(input: {
  code: string;
  field: string;
  extractedValue: unknown;
  expectedValue: unknown;
  difference: string;
  severity: DiscrepancySeverity;
  confidence: number;
  source: DiscrepancySource;
}): DiscrepancyItem {
  return {
    code: input.code,
    field: input.field,
    extracted_value: input.extractedValue,
    expected_value: input.expectedValue,
    difference: input.difference,
    severity: input.severity,
    confidence_score: rounded(clamp(input.confidence, 0, 100)),
    source: input.source,
  };
}

function buildConsensusContext(docs: WorkingDocument[]): ConsensusContext {
  const counts: Record<string, Map<string, number>> = {};
  const originals: Record<string, Map<string, string>> = {};

  for (const field of CONSISTENCY_FIELDS) {
    counts[field] = new Map<string, number>();
    originals[field] = new Map<string, string>();
  }

  for (const doc of docs) {
    for (const field of CONSISTENCY_FIELDS) {
      const raw = toStringOrNull(doc.extractedFields[field]);
      if (!raw) continue;

      const normalized = normalizedComparable(raw);
      if (!normalized) continue;

      counts[field].set(normalized, (counts[field].get(normalized) ?? 0) + 1);
      if (!originals[field].has(normalized)) {
        originals[field].set(normalized, raw);
      }
    }
  }

  const byField: Record<string, string> = {};
  const conflicts: Record<string, string[]> = {};

  for (const field of CONSISTENCY_FIELDS) {
    const entries = Array.from(counts[field].entries()).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) continue;

    const [winnerNormalized] = entries[0];
    const winnerValue = originals[field].get(winnerNormalized);
    if (winnerValue) {
      byField[field] = winnerValue;
    }

    if (entries.length > 1) {
      conflicts[field] = entries
        .map(([normalized]) => originals[field].get(normalized))
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    }
  }

  return { byField, conflicts };
}
function buildExpectedValues(input: {
  profile: Profile;
  application: LoanApplication;
  requiredRule: RequiredDocumentRule | null;
  consensus: ConsensusContext;
}): Record<string, unknown> {
  const expected: Record<string, unknown> = {};

  if (input.requiredRule) {
    expected.document_type = input.requiredRule.document_type;
    expected.document_display_name = input.requiredRule.display_name;
  }

  if (input.profile.full_name) expected.full_name = input.profile.full_name;
  if (input.profile.business_name) expected.business_name = input.profile.business_name;
  if (input.profile.district) expected.district = input.profile.district;
  expected.requested_amount = input.application.requested_amount;
  expected.purpose = input.application.purpose;

  for (const field of CONSISTENCY_FIELDS) {
    if (input.consensus.byField[field]) {
      expected[`consensus_${field}`] = input.consensus.byField[field];
    }
  }

  return expected;
}

function applyDocumentRuleVerification(input: {
  rules: VerificationRuleConfig;
  ocrText: string;
  confidenceScore: number;
}): RuleVerificationResult {
  if (
    input.rules.required_keywords.length === 0 &&
    input.rules.forbidden_keywords.length === 0 &&
    input.rules.min_text_length == null
  ) {
    return null;
  }

  const normalized = normalizeText(input.ocrText);
  const notes: string[] = [];
  const discrepancies: DiscrepancyItem[] = [];

  for (const keyword of input.rules.required_keywords) {
    if (!keyword) continue;
    if (!normalized.includes(keyword)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "RULE_REQUIRED_KEYWORD_MISSING",
          field: "ocr_text",
          extractedValue: null,
          expectedValue: keyword,
          difference: `Required keyword "${keyword}" was not found in OCR text.`,
          severity: "critical",
          confidence: clamp(input.confidenceScore, 20, 95),
          source: "rule",
        }),
      );
    }
  }

  for (const keyword of input.rules.forbidden_keywords) {
    if (!keyword) continue;
    if (normalized.includes(keyword)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "RULE_FORBIDDEN_KEYWORD_FOUND",
          field: "ocr_text",
          extractedValue: keyword,
          expectedValue: `Keyword "${keyword}" should not appear`,
          difference: `Forbidden keyword "${keyword}" was found in OCR text.`,
          severity: "critical",
          confidence: clamp(input.confidenceScore, 20, 95),
          source: "rule",
        }),
      );
    }
  }

  if (input.rules.min_text_length != null) {
    const actualLength = input.ocrText.trim().length;
    if (actualLength < input.rules.min_text_length) {
      discrepancies.push(
        makeDiscrepancy({
          code: "RULE_MIN_TEXT_LENGTH_FAILED",
          field: "ocr_text_length",
          extractedValue: actualLength,
          expectedValue: input.rules.min_text_length,
          difference: `OCR text length ${actualLength} is below required minimum ${input.rules.min_text_length}.`,
          severity: actualLength < Math.max(30, input.rules.min_text_length * 0.5) ? "critical" : "minor",
          confidence: clamp(input.confidenceScore, 20, 95),
          source: "rule",
        }),
      );
    }
  }

  if (discrepancies.length === 0) {
    notes.push("Document passed all configured verification rules.");
  }

  return {
    notes,
    discrepancies,
  };
}

async function buildAiDiscrepancySummary(input: {
  fileName: string;
  declaredType: string;
  detectedType: string | null;
  discrepancies: DiscrepancyItem[];
  missingFields: string[];
  baseRecommendation: FinalVerificationStatus;
}): Promise<AiDiscrepancySummary> {
  const critical = input.discrepancies.filter((item) => item.severity === "critical").length;
  const minor = input.discrepancies.length - critical;

  const significance: AiDiscrepancySummary["significance"] =
    critical > 0 ? "critical" : minor > 0 ? "minor" : "none";

  const fallbackSummary = (() => {
    if (significance === "none") {
      return "No material discrepancies were detected. OCR values align with expected checks.";
    }

    const details: string[] = [];
    if (critical > 0) details.push(`${critical} critical issue(s)`);
    if (minor > 0) details.push(`${minor} minor issue(s)`);
    if (input.missingFields.length > 0) {
      details.push(`missing fields: ${input.missingFields.join(", ")}`);
    }

    const typeSentence = input.detectedType
      ? `Detected type "${input.detectedType}" against expected "${input.declaredType}".`
      : `Detected type is unclear for expected "${input.declaredType}".`;

    return `${typeSentence} ${details.join("; ")}. Recommended action: ${input.baseRecommendation}.`;
  })();

  if (env.DOCUMENT_AI_PROVIDER !== "gemini") {
    return {
      summary: fallbackSummary,
      significance,
      minor_discrepancies: minor,
      critical_discrepancies: critical,
      recommended_status: input.baseRecommendation,
      source: "rule_engine",
    };
  }

  try {
    const prompt = [
      "Summarize document verification discrepancies for underwriting audit.",
      `File: ${input.fileName}`,
      `Expected Type: ${input.declaredType}`,
      `Detected Type: ${input.detectedType ?? "unclear"}`,
      `Critical Issues: ${critical}`,
      `Minor Issues: ${minor}`,
      `Missing Fields: ${input.missingFields.join(", ") || "none"}`,
      "Keep response under 80 words and include recommendation: Verified, Needs Review, or Rejected.",
    ].join("\n");

    const aiText = await aiService.generateChatResponse(
      "You are a strict document verification analyst. Produce concise, auditable summaries.",
      [],
      prompt,
    );

    return {
      summary: aiText.trim() || fallbackSummary,
      significance,
      minor_discrepancies: minor,
      critical_discrepancies: critical,
      recommended_status: input.baseRecommendation,
      source: "gemini",
    };
  } catch {
    return {
      summary: fallbackSummary,
      significance,
      minor_discrepancies: minor,
      critical_discrepancies: critical,
      recommended_status: input.baseRecommendation,
      source: "rule_engine",
    };
  }
}

function determineValidationStatus(input: {
  detectedTypeCanonical: string | null;
  declaredTypeCanonical: string;
  discrepancies: DiscrepancyItem[];
  confidenceScore: number;
  scanError: string | null;
}): ScanValidationStatus {
  if (input.scanError) return "unclear";

  const criticalCount = input.discrepancies.filter((item) => item.severity === "critical").length;
  const minorCount = input.discrepancies.length - criticalCount;

  if (criticalCount > 0) {
    return "invalid";
  }

  if (!input.detectedTypeCanonical || input.confidenceScore < 70 || minorCount > 0) {
    return "unclear";
  }

  if (input.detectedTypeCanonical !== input.declaredTypeCanonical) {
    return input.confidenceScore >= 70 ? "invalid" : "unclear";
  }

  return "valid";
}
function buildConfiguredExtractor(profile: Profile, application: LoanApplication): OcrExtractor {
  const provider = env.OCR_PROVIDER;

  if (provider === "azure_document_intelligence") {
    return new AzureExtractor(
      profile,
      application,
      {
        endpoint: env.OCR_AZURE_ENDPOINT || "",
        apiKey: env.OCR_AZURE_API_KEY || "",
        apiVersion: env.OCR_AZURE_API_VERSION,
        modelId: "prebuilt-document",
        locale: "en-US",
        pollIntervalMs: 1000,
        pollTimeoutMs: 60000,
        requestTimeoutMs: 15000,
      },
      detectDocumentTypeFromTokens,
      extractIssueDateFromText,
    );
  }

  if (provider === "google_vision") {
    return new GoogleVisionExtractor(
      profile,
      application,
      {
        endpoint: "https://vision.googleapis.com/v1/images:annotate",
        apiKey: env.OCR_GOOGLE_API_KEY || "",
        requestTimeoutMs: 20000,
        pdfToPpmCommand: "pdftoppm",
        pdfDpi: 200,
        pdfMaxPages: 5,
      },
      detectDocumentTypeFromTokens,
      extractIssueDateFromText,
    );
  }

  return new TesseractExtractor(
    profile,
    application,
    {
      command: "tesseract",
      language: "eng+msa",
      psm: 1,
      oem: 3,
      timeoutMs: 30000,
      pdfToPpmCommand: "pdftoppm",
      pdfDpi: 200,
      pdfMaxPages: 5,
    },
    detectDocumentTypeFromTokens,
    extractIssueDateFromText,
  );
}

async function applyAiTypeEnhancement(input: {
  extracted: ExtractedDocument;
  declaredType: string;
  fileName: string;
  requiredTypes: string[];
}): Promise<ExtractedDocument & { classifier?: AiTypeClassification }> {
  if (env.DOCUMENT_AI_PROVIDER !== "gemini") {
    return input.extracted;
  }

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

export async function scanApplicationDocuments(
  userId: string,
  applicationId: string,
  options: ScanOptions = {},
) {
  const profileResult = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
  if (profileResult.error || !profileResult.data) {
    throw forbidden("Profile not found");
  }
  const profile = profileResult.data as Profile;

  const applicationResult = await supabaseAdmin.from("loan_applications").select("*").eq("id", applicationId).single();
  if (applicationResult.error || !applicationResult.data) {
    throw notFound("Application not found");
  }
  const application = applicationResult.data as LoanApplication;

  const selectedProductId = options.productId || application.selected_product_id;

  const fallbackProductIds: string[] = [];
  if (selectedProductId) {
    fallbackProductIds.push(String(selectedProductId));
  } else if (application.selected_product_id) {
    fallbackProductIds.push(String(application.selected_product_id));
  } else {
    const productContextResult = await supabaseAdmin
      .from("application_results")
      .select("product_id")
      .eq("application_id", applicationId);

    if (productContextResult.error) {
      throw internalError("Failed to load application product context", productContextResult.error);
    }

    for (const row of productContextResult.data ?? []) {
      const productId = toStringOrNull(row.product_id);
      if (productId) fallbackProductIds.push(productId);
    }
  }

  const requiredDefinitions: RequiredDocumentRule[] = [];
  const productIds = uniqueStrings(fallbackProductIds);

  if (productIds.length > 0) {
    const requiredDocsResult = await supabaseAdmin
      .from("required_documents")
      .select("product_id, document_type, display_name, is_required, verification_rules_json")
      .in("product_id", productIds);

    if (requiredDocsResult.error) {
      throw internalError("Failed to load required document definitions", requiredDocsResult.error);
    }

    for (const row of requiredDocsResult.data ?? []) {
      requiredDefinitions.push({
        product_id: toStringOrNull(row.product_id),
        document_type: String(row.document_type),
        display_name: String(row.display_name),
        required: Boolean(row.is_required),
        verification_rules: parseVerificationRules(row.verification_rules_json),
      });
    }
  }

  const requiredTypes = uniqueStrings(
    requiredDefinitions
      .map((rule) => canonicalizeDocumentType(rule.document_type))
      .filter((value): value is string => Boolean(value)),
  );

  const requiredByType = new Map<string, RequiredDocumentRule>();
  for (const rule of requiredDefinitions) {
    const key = canonicalizeDocumentType(rule.document_type);
    if (key && !requiredByType.has(key)) {
      requiredByType.set(key, rule);
    }
  }
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
  if (documentsResult.error) {
    throw internalError("Failed to load documents for scanning", documentsResult.error);
  }

  const rows = documentsResult.data ?? [];
  const extractor = buildConfiguredExtractor(profile, application);

  let scannedCount = 0;
  const workingDocs: WorkingDocument[] = [];

  for (const row of rows) {
    const typedRow: DocumentDbRow = {
      id: String(row.id),
      application_id: String(row.application_id),
      user_id: String(row.user_id),
      product_id: toStringOrNull(row.product_id),
      document_type: String(row.document_type),
      file_name: String(row.file_name),
      storage_bucket: toStringOrNull(row.storage_bucket),
      storage_path: String(row.storage_path),
      mime_type: toStringOrNull(row.mime_type),
      extracted_json: toRecord(row.extracted_json),
      validation_status: toStringOrNull(row.validation_status),
      detected_doc_type: toStringOrNull(row.detected_doc_type),
      ocr_text: toStringOrNull(row.ocr_text),
      status: toStringOrNull(row.status),
      created_at: String(row.created_at),
    };

    const existingExtracted = typedRow.extracted_json;
    const shouldRescan = Boolean(options.forceRescan) || !typedRow.ocr_text || Object.keys(existingExtracted).length === 0;

    let detectedDocType: string | null = typedRow.detected_doc_type;
    let ocrText = typedRow.ocr_text ?? "";
    let confidenceScore = toNumber(existingExtracted.confidence_score, 0);
    let extractedFields = { ...existingExtracted };
    let notes: string[] = [];
    let warnings: string[] = [];
    let scanError: string | null = null;
    let classifier: AiTypeClassification | null = null;

    if (shouldRescan) {
      scannedCount += 1;
      try {
        const extracted = await extractor.extract({
          storageBucket: String(typedRow.storage_bucket ?? ""),
          storagePath: typedRow.storage_path,
          mimeType: typedRow.mime_type,
          fileName: typedRow.file_name,
          declaredType: typedRow.document_type,
        });

        const extractedWithAi = await applyAiTypeEnhancement({
          extracted,
          declaredType: typedRow.document_type,
          fileName: typedRow.file_name,
          requiredTypes,
        });

        detectedDocType = extractedWithAi.detectedType;
        ocrText = extractedWithAi.text;
        confidenceScore = rounded(extractedWithAi.confidenceScore);
        warnings = uniqueStrings(extractedWithAi.warnings);
        classifier = extractedWithAi.classifier ?? null;

        const parsedFields = extractKeyFieldsFromText(ocrText);
        extractedFields = mergeExtractedFields(
          mergeExtractedFields(extractedFields, extractedWithAi.extractedFields),
          parsedFields,
        );
        extractedFields.confidence_score = confidenceScore;
        extractedFields.extraction_engine = extractedWithAi.engine;
        extractedFields.detected_doc_type = detectedDocType;
        extractedFields.scanned_at = new Date().toISOString();

        notes = ["OCR scan completed."];
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected scan error";
        const safeErrorMessage = sanitizeScanErrorMessage(message);
        scanError = safeErrorMessage;
        confidenceScore = 0;
        extractedFields = {
          ...existingExtracted,
          confidence_score: 0,
          scan_error: { message: safeErrorMessage, at: new Date().toISOString() },
        };
        notes = ["Manual review is required.", `Scan error: ${safeErrorMessage}`];
      }
    } else {
      const parsedFields = extractKeyFieldsFromText(ocrText);
      extractedFields = mergeExtractedFields(extractedFields, parsedFields);
      detectedDocType = typedRow.detected_doc_type ?? toStringOrNull(extractedFields.detected_doc_type);
      confidenceScore = rounded(toNumber(extractedFields.confidence_score, 0));
      notes = ["Using previously scanned data."];
    }

    const declaredTypeCanonical = canonicalizeDocumentType(typedRow.document_type) ?? normalizeText(typedRow.document_type);
    const requiredRule = requiredByType.get(declaredTypeCanonical) ?? null;

    workingDocs.push({
      row: typedRow,
      declaredType: typedRow.document_type,
      declaredTypeCanonical,
      requiredRule,
      requiredTypes,
      extractedText: ocrText,
      detectedType: detectedDocType,
      detectedTypeCanonical: canonicalizeDocumentType(detectedDocType),
      confidenceScore,
      extractedFields,
      warnings,
      notes,
      scanned: shouldRescan,
      scanError,
      classifier,
    });
  }

  const consensus = buildConsensusContext(workingDocs);
  const duplicateFileTypeMap = new Map<string, Set<string>>();
  for (const doc of workingDocs) {
    const key = `${normalizeText(doc.row.file_name)}|${textFingerprint(doc.extractedText)}`;
    const typeSet = duplicateFileTypeMap.get(key) ?? new Set<string>();
    typeSet.add(doc.declaredTypeCanonical);
    duplicateFileTypeMap.set(key, typeSet);
  }

  const evaluated: EvaluatedDocument[] = [];

  for (const doc of workingDocs) {
    const discrepancies: DiscrepancyItem[] = [];
    const missingFields: string[] = [];
    const notes = [...doc.notes];

    const expectedValues = buildExpectedValues({
      profile,
      application,
      requiredRule: doc.requiredRule,
      consensus,
    });

    const detectedTypeCanonical = doc.detectedTypeCanonical;
    const typeMatched =
      detectedTypeCanonical != null &&
      isDocumentTypeMatch(doc.declaredTypeCanonical, detectedTypeCanonical);

    if (!detectedTypeCanonical) {
      discrepancies.push(
        makeDiscrepancy({
          code: "TYPE_NOT_DETECTED",
          field: "document_type",
          extractedValue: doc.detectedType,
          expectedValue: doc.declaredTypeCanonical,
          difference: "Document type could not be confidently identified.",
          severity: doc.confidenceScore >= 55 ? "minor" : "critical",
          confidence: doc.confidenceScore,
          source: "ocr",
        }),
      );
    } else if (!typeMatched) {
      discrepancies.push(
        makeDiscrepancy({
          code: "TYPE_MISMATCH",
          field: "document_type",
          extractedValue: detectedTypeCanonical,
          expectedValue: doc.declaredTypeCanonical,
          difference: `Detected "${detectedTypeCanonical}" but expected "${doc.declaredTypeCanonical}".`,
          severity: doc.confidenceScore >= 70 ? "critical" : "minor",
          confidence: doc.confidenceScore,
          source: "ocr",
        }),
      );
    } else {
      notes.push("Document type matches expected requirement.");
    }
    if (doc.requiredTypes.length > 0 && !doc.requiredTypes.includes(doc.declaredTypeCanonical)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "DECLARED_TYPE_NOT_REQUIRED",
          field: "document_type",
          extractedValue: doc.declaredTypeCanonical,
          expectedValue: doc.requiredTypes.join(", "),
          difference: "Declared document type is not currently listed under required product documents.",
          severity: "minor",
          confidence: 90,
          source: "rule",
        }),
      );
    }

    const requiredFields = requiredFieldsForType(doc.declaredTypeCanonical, detectedTypeCanonical);
    if (!doc.requiredRule && requiredFields.length === 0 && !isKnownDocumentType(doc.declaredTypeCanonical)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "NO_VERIFICATION_RULES_CONFIGURED",
          field: "document_type",
          extractedValue: doc.declaredTypeCanonical,
          expectedValue: "configured verification rules or known document type mapping",
          difference: "No validation rule profile exists for this document type, so automated verification cannot be trusted.",
          severity: "minor",
          confidence: 100,
          source: "rule",
        }),
      );
    }

    const duplicateKey = `${normalizeText(doc.row.file_name)}|${textFingerprint(doc.extractedText)}`;
    const duplicateTypes = duplicateFileTypeMap.get(duplicateKey);
    if (duplicateTypes && duplicateTypes.size > 1) {
      discrepancies.push(
        makeDiscrepancy({
          code: "DUPLICATE_FILE_USED_FOR_MULTIPLE_TYPES",
          field: "file_name",
          extractedValue: doc.row.file_name,
          expectedValue: "unique source document per required type",
          difference: "The same OCR/file fingerprint appears under multiple declared document types.",
          severity: "critical",
          confidence: 98,
          source: "cross_document",
        }),
      );
    }

    for (const field of requiredFields) {
      const value = doc.extractedFields[field];
      const present = toStringOrNull(value) != null || (typeof value === "number" && Number.isFinite(value));
      if (!present) {
        missingFields.push(field);
        discrepancies.push(
          makeDiscrepancy({
            code: "MISSING_REQUIRED_FIELD",
            field,
            extractedValue: null,
            expectedValue: "present",
            difference: `Missing required field "${field}".`,
            severity: CRITICAL_FIELDS.has(field) ? "critical" : "minor",
            confidence: clamp(doc.confidenceScore, 20, 90),
            source: "ocr",
          }),
        );
      }
    }

    const ruleResult = applyDocumentRuleVerification({
      rules: doc.requiredRule?.verification_rules ?? {
        required_keywords: [],
        forbidden_keywords: [],
        min_text_length: null,
        ai_instructions: null,
      },
      ocrText: doc.extractedText,
      confidenceScore: doc.confidenceScore,
    });

    if (ruleResult) {
      discrepancies.push(...ruleResult.discrepancies);
      notes.push(...ruleResult.notes);
    }

    const fullNameDoc = toStringOrNull(doc.extractedFields.full_name);
    if (fullNameDoc && profile.full_name && !valuesMatch("full_name", fullNameDoc, profile.full_name)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "PROFILE_FULL_NAME_MISMATCH",
          field: "full_name",
          extractedValue: fullNameDoc,
          expectedValue: profile.full_name,
          difference: "Document full name does not match profile full name.",
          severity: "critical",
          confidence: clamp(doc.confidenceScore, 25, 95),
          source: "system_record",
        }),
      );
    }

    const businessNameDoc = toStringOrNull(doc.extractedFields.business_name);
    if (businessNameDoc && profile.business_name && !valuesMatch("business_name", businessNameDoc, profile.business_name)) {
      discrepancies.push(
        makeDiscrepancy({
          code: "PROFILE_BUSINESS_NAME_MISMATCH",
          field: "business_name",
          extractedValue: businessNameDoc,
          expectedValue: profile.business_name,
          difference: "Document business name does not match profile business name.",
          severity: "critical",
          confidence: clamp(doc.confidenceScore, 25, 95),
          source: "system_record",
        }),
      );
    }

    const amountValue = doc.extractedFields.amount;
    if (typeof amountValue === "number" && Number.isFinite(amountValue) && Number(application.requested_amount) > 0) {
      const requestedAmount = Number(application.requested_amount);
      const ratio = amountValue / requestedAmount;
      if (ratio > 3 || ratio < 0.2) {
        discrepancies.push(
          makeDiscrepancy({
            code: "AMOUNT_OUTLIER_VS_APPLICATION",
            field: "amount",
            extractedValue: amountValue,
            expectedValue: requestedAmount,
            difference: "Extracted amount is materially different from requested loan amount.",
            severity: "minor",
            confidence: clamp(doc.confidenceScore, 20, 85),
            source: "system_record",
          }),
        );
      }
    }

    for (const field of CONSISTENCY_FIELDS) {
      const current = toStringOrNull(doc.extractedFields[field]);
      const consensusValue = consensus.byField[field];
      const conflictValues = consensus.conflicts[field] ?? [];

      if (!current || !consensusValue || conflictValues.length === 0) {
        continue;
      }

      if (!valuesMatch(field, current, consensusValue)) {
        discrepancies.push(
          makeDiscrepancy({
            code: "CROSS_DOCUMENT_INCONSISTENCY",
            field,
            extractedValue: current,
            expectedValue: consensusValue,
            difference: `Value for "${field}" is inconsistent across uploaded documents.`,
            severity: CRITICAL_FIELDS.has(field) ? "critical" : "minor",
            confidence: clamp(doc.confidenceScore, 25, 90),
            source: "cross_document",
          }),
        );
      }
    }

    if (doc.scanError) {
      discrepancies.push(
        makeDiscrepancy({
          code: "SCAN_ERROR",
          field: "scan",
          extractedValue: doc.scanError,
          expectedValue: "successful scan",
          difference: "OCR extraction failed. Manual review required.",
          severity: "critical",
          confidence: 100,
          source: "ocr",
        }),
      );
    }

    if (doc.confidenceScore < 55) {
      discrepancies.push(
        makeDiscrepancy({
          code: "LOW_OCR_CONFIDENCE",
          field: "ocr_confidence",
          extractedValue: doc.confidenceScore,
          expectedValue: ">= 70",
          difference: "Low OCR confidence score.",
          severity: doc.confidenceScore < 40 ? "critical" : "minor",
          confidence: 100,
          source: "ocr",
        }),
      );
    }

    const validationStatus = determineValidationStatus({
      detectedTypeCanonical,
      declaredTypeCanonical: doc.declaredTypeCanonical,
      discrepancies,
      confidenceScore: doc.confidenceScore,
      scanError: doc.scanError,
    });

    const workflowStatus = getDocumentWorkflowStatus(validationStatus);
    const finalVerificationStatus = toFinalVerificationStatus(validationStatus);

    const criticalCount = discrepancies.filter((item) => item.severity === "critical").length;
    const minorCount = discrepancies.length - criticalCount;
    const typeDetectionConfidence = detectedTypeCanonical
      ? rounded(Math.min(100, doc.confidenceScore + (typeMatched ? 10 : -10)))
      : rounded(Math.max(0, doc.confidenceScore - 20));
    const overallVerificationConfidence = rounded(
      clamp(doc.confidenceScore - criticalCount * 18 - minorCount * 6, 0, 100),
    );

    const discrepancyReport: DocumentDiscrepancyReport = {
      ocr_extracted_values: doc.extractedFields,
      expected_values: expectedValues,
      detected_differences: discrepancies,
      missing_fields: missingFields,
      confidence_scores: {
        ocr_confidence: rounded(doc.confidenceScore),
        type_detection_confidence: typeDetectionConfidence,
        overall_verification_confidence: overallVerificationConfidence,
      },
      type_comparison: {
        expected_document_type: doc.declaredTypeCanonical,
        detected_document_type: detectedTypeCanonical,
        matched: typeMatched,
      },
    };
    const aiSummary = await buildAiDiscrepancySummary({
      fileName: doc.row.file_name,
      declaredType: doc.declaredTypeCanonical,
      detectedType: detectedTypeCanonical,
      discrepancies,
      missingFields,
      baseRecommendation: finalVerificationStatus,
    });

    const extractedFieldsToStore = mergeExtractedFields(doc.extractedFields, {
      discrepancy_report: discrepancyReport,
      ai_discrepancy_summary: aiSummary,
      final_verification_status: finalVerificationStatus,
      confidence_score: rounded(doc.confidenceScore),
      detected_doc_type: detectedTypeCanonical ?? doc.detectedType,
      classifier_reason: doc.classifier?.reason ?? null,
      validated_at: new Date().toISOString(),
      validation_status: validationStatus,
    });

    const summaryNotes = uniqueStrings([
      ...notes,
      ...doc.warnings,
      `Discrepancies detected: ${discrepancies.length} (critical: ${criticalCount}, minor: ${minorCount}).`,
      aiSummary.summary,
    ]);

    const summary: ScanDocumentSummary = {
      document_id: doc.row.id,
      document_type: doc.row.document_type,
      expected_document_type: doc.declaredTypeCanonical,
      file_name: doc.row.file_name,
      detected_doc_type: detectedTypeCanonical ?? doc.detectedType,
      validation_status: validationStatus,
      final_verification_status: finalVerificationStatus,
      confidence_score: rounded(doc.confidenceScore),
      notes: summaryNotes,
      extracted_fields: extractedFieldsToStore,
      ocr_preview: truncateText(doc.extractedText, 220),
      discrepancy_report: discrepancyReport,
      ai_discrepancy_summary: aiSummary,
      scanned: doc.scanned,
    };

    evaluated.push({
      row: doc.row,
      summary,
      validationStatus,
      workflowStatus,
      detectedDocType: detectedTypeCanonical ?? doc.detectedType,
      extractedFieldsToStore,
      ocrText: doc.extractedText,
    });
  }

  for (const doc of evaluated) {
    const updateResult = await supabaseAdmin
      .from("documents")
      .update({
        detected_doc_type: doc.detectedDocType,
        ocr_text: doc.ocrText,
        extracted_json: doc.extractedFieldsToStore,
        validation_status: doc.validationStatus,
        status: doc.workflowStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.row.id);

    if (updateResult.error) {
      throw internalError("Failed to persist document scan results", updateResult.error);
    }
  }

  const summaries = evaluated.map((item) => item.summary);
  const validCount = summaries.filter((item) => item.validation_status === "valid").length;
  const invalidCount = summaries.filter((item) => item.validation_status === "invalid").length;
  const unclearCount = summaries.filter((item) => item.validation_status === "unclear").length;

  const checklist = selectedProductId
    ? await checkDocumentCompleteness(userId, applicationId, [selectedProductId])
    : await checkDocumentCompleteness(userId, applicationId);

  const checklistSummary = toRecord(checklist.summary);
  const missingRequiredCount = toNumber(checklistSummary.total_missing, 0);

  const aggregatedAiSummary = (() => {
    const critical = summaries.reduce((sum, doc) => sum + doc.ai_discrepancy_summary.critical_discrepancies, 0);
    const minor = summaries.reduce((sum, doc) => sum + doc.ai_discrepancy_summary.minor_discrepancies, 0);
    const verified = summaries.filter((doc) => doc.final_verification_status === "Verified").length;
    const needsReview = summaries.filter((doc) => doc.final_verification_status === "Needs Review").length;
    const rejected = summaries.filter((doc) => doc.final_verification_status === "Rejected").length;

    return [
      `Processed ${summaries.length} document(s).`,
      `Verified: ${verified}, Needs Review: ${needsReview}, Rejected: ${rejected}.`,
      `Discrepancies: ${critical} critical and ${minor} minor.`,
    ].join(" ");
  })();

  await logAudit({
    actorUserId: userId,
    action: "documents.scanned",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      scanned_count: scannedCount,
      total_documents: summaries.length,
      valid_count: validCount,
      invalid_count: invalidCount,
      unclear_count: unclearCount,
      missing_required_count: missingRequiredCount,
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
    ai_discrepancy_summary: aggregatedAiSummary,
    documents: summaries,
  };
}
