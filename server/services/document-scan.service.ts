
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
type FinalVerificationStatus = "Verified" | "Rejected" | "Needs Review";

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
  notes: string | null;
  accepted_formats: string[];
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

type AiDocumentAnalysis = {
  document_type: string;
  extracted_information: Array<{
    label: string;
    value: string;
  }>;
  requirement_match: Array<{
    status: "match" | "warning";
    message: string;
  }>;
  summary: string;
  eligibility_hint: string;
  source: "rule_engine" | "gemini";
};

type AiComputedMetrics = {
  bank_statement?: {
    total_deposits: number | null;
    monthly_average_balance: number | null;
    period_months: number | null;
    source: "rule_engine" | "gemini";
  };
  financial_statements?: {
    annual_net_profit: number | null;
    fiscal_year: string | null;
    source: "rule_engine" | "gemini";
  };
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
  ai_document_analysis: AiDocumentAnalysis;
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
  collateral_deed: [],
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

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const direct = raw.trim();
  try {
    const parsed = JSON.parse(direct) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // no-op
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
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

function formatDocumentTypeLabel(value: string | null): string {
  const normalized = canonicalizeDocumentType(value) ?? normalizeKey(value ?? "");
  if (!normalized) {
    return "Unknown Document";
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function summarizeExtractedInformation(
  declaredType: string,
  extractedFields: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const preferredKeysByType: Record<string, Array<{ key: string; label: string }>> = {
    nic: [
      { key: "full_name", label: "Holder Name" },
      { key: "nic_number", label: "NIC Number" },
      { key: "date_of_birth", label: "Date of Birth" },
    ],
    business_registration: [
      { key: "business_name", label: "Business Name" },
      { key: "registration_number", label: "Registration Number" },
      { key: "issue_date", label: "Issue Date" },
    ],
    bank_statement: [
      { key: "bank_name", label: "Bank" },
      { key: "account_holder", label: "Account Holder" },
      { key: "statement_period", label: "Period" },
      { key: "account_number", label: "Account Number" },
    ],
    utility_bill: [
      { key: "service_provider", label: "Provider" },
      { key: "address", label: "Address" },
      { key: "issue_date", label: "Issue Date" },
    ],
    tin_tax: [
      { key: "taxpayer_name", label: "Taxpayer" },
      { key: "tin_number", label: "Tax File Number" },
      { key: "issue_date", label: "Issue Date" },
    ],
    financial_statements: [
      { key: "business_name", label: "Business Name" },
      { key: "fiscal_year", label: "Fiscal Year" },
      { key: "annual_net_profit", label: "Annual Net Profit" },
    ],
  };

  const canonical = canonicalizeDocumentType(declaredType) ?? declaredType;
  const preferredKeys = preferredKeysByType[canonical] ?? [];
  const extracted: Array<{ label: string; value: string }> = [];

  for (const field of preferredKeys) {
    const value = toStringOrNull(extractedFields[field.key]);
    if (!value) {
      continue;
    }
    extracted.push({ label: field.label, value });
  }

  if (extracted.length > 0) {
    return extracted.slice(0, 4);
  }

  return Object.entries(extractedFields)
    .filter(([key, value]) => {
      if (key.includes("discrepancy") || key.includes("summary") || key.includes("validated")) {
        return false;
      }
      if (value == null) {
        return false;
      }
      if (typeof value === "object") {
        return false;
      }
      return String(value).trim().length > 0;
    })
    .slice(0, 4)
    .map(([key, value]) => ({
      label: key
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      value: String(value).trim(),
    }));
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
  if (status === "unclear") return "needs_review";
  return "rejected";
}

function toFinalVerificationStatus(status: ScanValidationStatus): FinalVerificationStatus {
  if (status === "valid") return "Verified";
  if (status === "unclear") return "Needs Review";
  return "Rejected";
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

function normalizeOcrNicCandidate(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[OoQq]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

function formatDateFromYearAndDayOfYear(year: number, rawDayOfYear: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(rawDayOfYear) || year < 1900 || year > 2100) {
    return null;
  }

  const isFemale = rawDayOfYear > 500;
  const dayOfYear = isFemale ? rawDayOfYear - 500 : rawDayOfYear;
  const maxDay = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;

  if (dayOfYear < 1 || dayOfYear > maxDay) {
    return null;
  }

  const date = new Date(Date.UTC(year, 0, dayOfYear));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function deriveDateOfBirthFromNic(nicNumber: string): string | null {
  const normalized = normalizeOcrNicCandidate(nicNumber);

  if (/^\d{9}[VX]$/i.test(normalized)) {
    const year = 1900 + Number(normalized.slice(0, 2));
    const dayOfYear = Number(normalized.slice(2, 5));
    return formatDateFromYearAndDayOfYear(year, dayOfYear);
  }

  if (/^\d{12}$/.test(normalized)) {
    const year = Number(normalized.slice(0, 4));
    const dayOfYear = Number(normalized.slice(4, 7));
    return formatDateFromYearAndDayOfYear(year, dayOfYear);
  }

  return null;
}

function extractSriLankanNicNumber(text: string): string | null {
  const candidates = Array.from(
    new Set(
      text.match(/\b[A-Za-z0-9]{9,12}[VvXx]?\b/g) ?? [],
    ),
  );

  for (const candidate of candidates) {
    const normalized = normalizeOcrNicCandidate(candidate);
    if (/^\d{9}[VX]$/i.test(normalized) || /^\d{12}$/.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function inferDocumentTypeFromFields(fields: Record<string, unknown>): string | null {
  if (toStringOrNull(fields.nic_number)) return "nic";
  if (toStringOrNull(fields.passport_number)) return "passport";
  if (toStringOrNull(fields.invoice_number)) return "invoice";
  if (toStringOrNull(fields.registration_number)) return "business_registration";
  if (toStringOrNull(fields.tin_number)) return "tin_tax";
  if (toStringOrNull(fields.account_number)) return "bank_statement";
  if (toStringOrNull(fields.certificate_number)) return "certificate";
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

  const nicNumber = extractSriLankanNicNumber(source) ?? extractFirst(source, [
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

  if (!result.date_of_birth && nicNumber) {
    const derivedDateOfBirth = deriveDateOfBirthFromNic(nicNumber);
    if (derivedDateOfBirth) {
      result.date_of_birth = derivedDateOfBirth;
    }
  }

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
    notes.push("Document analysis did not surface any additional rule-based warnings.");
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
      return "The document was analyzed without major issues. Use this as guidance only while the bank completes its own review.";
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

    return `${typeSentence} ${details.join("; ")}. This is guidance only and may still need bank review.`;
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
      "Summarize document guidance points for applicant review.",
      `File: ${input.fileName}`,
      `Expected Type: ${input.declaredType}`,
      `Detected Type: ${input.detectedType ?? "unclear"}`,
      `Critical Issues: ${critical}`,
      `Minor Issues: ${minor}`,
      `Missing Fields: ${input.missingFields.join(", ") || "none"}`,
      "Keep response under 80 words. Explain the main guidance points and mention that final approval stays with the bank.",
    ].join("\n");

    const aiText = await aiService.generateChatResponse(
      "You analyze uploaded loan documents for guidance only. Produce concise, auditable summaries.",
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

async function buildAiDocumentAnalysis(input: {
  fileName: string;
  declaredType: string;
  detectedType: string | null;
  ocrText: string;
  extractedFields: Record<string, unknown>;
  requirementTitle: string;
  requirementNotes: string | null;
  acceptedFormats: string[];
}): Promise<AiDocumentAnalysis> {
  const typeMatched = input.detectedType
    ? isDocumentTypeMatch(input.declaredType, input.detectedType)
    : false;
  const extractedInformation = summarizeExtractedInformation(input.declaredType, input.extractedFields);
  const requirementMatch: AiDocumentAnalysis["requirement_match"] = [
    {
      status: typeMatched ? "match" : "warning",
      message: typeMatched
        ? `Document type appears to match the bank requirement for ${input.requirementTitle}.`
        : `Document type could not be confidently matched to ${input.requirementTitle}.`,
    },
    {
      status: extractedInformation.length > 0 ? "match" : "warning",
      message: extractedInformation.length > 0
        ? "Key information was extracted from the uploaded file."
        : "Only limited information could be extracted from the uploaded file.",
    },
  ];

  if (input.requirementNotes) {
    requirementMatch.push({
      status: "warning",
      message: `Bank note: ${input.requirementNotes}`,
    });
  }

  const fallback: AiDocumentAnalysis = {
    document_type: formatDocumentTypeLabel(input.detectedType ?? input.declaredType),
    extracted_information: extractedInformation,
    requirement_match: requirementMatch.slice(0, 4),
    summary: typeMatched
      ? `The uploaded file appears to be a ${formatDocumentTypeLabel(input.detectedType ?? input.declaredType)} and generally aligns with the selected bank requirement.`
      : "The uploaded file was analyzed, but the exact document type or requirement fit is still uncertain.",
    eligibility_hint: typeMatched && extractedInformation.length > 0
      ? "This document looks useful for SME loan review, but final approval still depends on the bank's internal process."
      : "This upload is informational only. A clearer or more complete document may still be requested by the bank.",
    source: "rule_engine",
  };

  if (env.DOCUMENT_AI_PROVIDER !== "gemini" || input.ocrText.trim().length < env.DOCUMENT_AI_MIN_OCR_CHARS) {
    return fallback;
  }

  try {
    const response = await aiService.generateChatResponse(
      "You analyze uploaded loan documents for optional applicant guidance. Return strict JSON only.",
      [],
      [
        "Return JSON only with this exact shape:",
        '{"document_type": string, "extracted_information": [{"label": string, "value": string}], "requirement_match": [{"status": "match" | "warning", "message": string}], "summary": string, "eligibility_hint": string}',
        "Rules:",
        "- Use only the OCR text and bank requirement context provided.",
        "- Keep extracted_information to at most 4 items.",
        "- Keep requirement_match to at most 4 items.",
        "- Do not claim final bank approval.",
        `File: ${input.fileName}`,
        `Expected document type: ${formatDocumentTypeLabel(input.declaredType)}`,
        `Detected document type: ${formatDocumentTypeLabel(input.detectedType ?? input.declaredType)}`,
        `Bank requirement: ${input.requirementTitle}`,
        `Bank note: ${input.requirementNotes ?? "none"}`,
        `Accepted formats: ${input.acceptedFormats.join(", ") || "pdf, jpg, jpeg, png"}`,
        `Pre-extracted fields: ${JSON.stringify(extractedInformation)}`,
        "OCR text:",
        input.ocrText.slice(0, env.DOCUMENT_AI_MAX_TEXT_CHARS),
      ].join("\n"),
    );

    const parsed = extractJsonObject(response);
    if (!parsed) {
      return fallback;
    }

    const parsedExtractedInformation = Array.isArray(parsed.extracted_information)
      ? parsed.extracted_information
        .map((item) => toRecord(item))
        .map((item) => ({
          label: toStringOrNull(item.label),
          value: toStringOrNull(item.value),
        }))
        .filter((item): item is { label: string; value: string } => Boolean(item.label && item.value))
        .slice(0, 4)
      : fallback.extracted_information;

    const parsedRequirementMatch = Array.isArray(parsed.requirement_match)
      ? parsed.requirement_match
        .map((item) => toRecord(item))
        .map((item) => ({
          status: item.status === "match" ? "match" : "warning",
          message: toStringOrNull(item.message),
        }))
        .filter((item): item is { status: "match" | "warning"; message: string } => Boolean(item.message))
        .slice(0, 4)
      : fallback.requirement_match;

    return {
      document_type: toStringOrNull(parsed.document_type) ?? fallback.document_type,
      extracted_information: parsedExtractedInformation.length > 0 ? parsedExtractedInformation : fallback.extracted_information,
      requirement_match: parsedRequirementMatch.length > 0 ? parsedRequirementMatch : fallback.requirement_match,
      summary: toStringOrNull(parsed.summary) ?? fallback.summary,
      eligibility_hint: toStringOrNull(parsed.eligibility_hint) ?? fallback.eligibility_hint,
      source: "gemini",
    };
  } catch {
    return fallback;
  }
}

async function buildAiComputedMetrics(input: {
  declaredType: string;
  ocrText: string;
}): Promise<AiComputedMetrics> {
  const declaredType = canonicalizeDocumentType(input.declaredType) ?? input.declaredType;
  if (
    env.DOCUMENT_AI_PROVIDER !== "gemini" ||
    input.ocrText.trim().length < env.DOCUMENT_AI_MIN_OCR_CHARS ||
    (declaredType !== "bank_statement" && declaredType !== "financial_statements")
  ) {
    return {};
  }

  try {
    const prompt =
      declaredType === "bank_statement"
        ? [
            "Read the OCR text of a bank statement and return strict JSON only.",
            '{"total_deposits": number | null, "monthly_average_balance": number | null, "period_months": number | null}',
            "Calculate total deposits and monthly average balance from the available statement period.",
            input.ocrText.slice(0, env.DOCUMENT_AI_MAX_TEXT_CHARS),
          ].join("\n")
        : [
            "Read the OCR text of financial statements and return strict JSON only.",
            '{"annual_net_profit": number | null, "fiscal_year": string | null}',
            "Extract the annual net profit for the most recent fiscal year.",
            input.ocrText.slice(0, env.DOCUMENT_AI_MAX_TEXT_CHARS),
          ].join("\n");

    const response = await aiService.generateChatResponse(
      "You are a precise financial document extraction engine. Return JSON only.",
      [],
      prompt,
    );
    const parsed = extractJsonObject(response);
    if (!parsed) return {};

    if (declaredType === "bank_statement") {
      const totalDeposits = Number(parsed.total_deposits);
      const monthlyAverageBalance = Number(parsed.monthly_average_balance);
      const periodMonths = Number(parsed.period_months);
      return {
        bank_statement: {
          total_deposits: Number.isFinite(totalDeposits) ? rounded(totalDeposits, 2) : null,
          monthly_average_balance: Number.isFinite(monthlyAverageBalance) ? rounded(monthlyAverageBalance, 2) : null,
          period_months: Number.isFinite(periodMonths) ? Math.round(periodMonths) : null,
          source: "gemini",
        },
      };
    }

    return {
      financial_statements: {
        annual_net_profit: Number.isFinite(Number(parsed.annual_net_profit))
          ? rounded(Number(parsed.annual_net_profit), 2)
          : null,
        fiscal_year: toStringOrNull(parsed.fiscal_year),
        source: "gemini",
      },
    };
  } catch {
    return {};
  }
}

function determineValidationStatus(input: {
  detectedTypeCanonical: string | null;
  declaredTypeCanonical: string;
  discrepancies: DiscrepancyItem[];
  confidenceScore: number;
  scanError: string | null;
}): ScanValidationStatus {
  if (input.scanError) return "invalid";

  const criticalCount = input.discrepancies.filter((item) => item.severity === "critical").length;

  if (criticalCount > 0) {
    return "invalid";
  }

  if (!input.detectedTypeCanonical || input.confidenceScore < 55) {
    return "unclear";
  }

  if (input.detectedTypeCanonical !== input.declaredTypeCanonical) {
    return "unclear";
  }

  if (input.discrepancies.length > 0) {
    return "unclear";
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
        modelId: env.OCR_AZURE_MODEL_ID,
        locale: env.OCR_AZURE_LOCALE ?? null,
        pollIntervalMs: env.OCR_AZURE_POLL_INTERVAL_MS,
        pollTimeoutMs: env.OCR_AZURE_POLL_TIMEOUT_MS,
        requestTimeoutMs: env.OCR_AZURE_REQUEST_TIMEOUT_MS,
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
        endpoint: `${env.OCR_GOOGLE_ENDPOINT.replace(/\/+$/, "")}/images:annotate`,
        apiKey: env.OCR_GOOGLE_API_KEY || "",
        requestTimeoutMs: env.OCR_GOOGLE_REQUEST_TIMEOUT_MS,
        pdfToPpmCommand: env.OCR_PDFTOPPM_COMMAND,
        pdfDpi: env.OCR_PDF_DPI,
        pdfMaxPages: env.OCR_PDF_MAX_PAGES,
      },
      detectDocumentTypeFromTokens,
      extractIssueDateFromText,
    );
  }

  return new TesseractExtractor(
    profile,
    application,
    {
      command: env.OCR_TESSERACT_COMMAND,
      language: env.OCR_TESSERACT_LANGUAGE,
      psm: env.OCR_TESSERACT_PSM,
      oem: env.OCR_TESSERACT_OEM,
      timeoutMs: env.OCR_TESSERACT_TIMEOUT_MS,
      pdfToPpmCommand: env.OCR_PDFTOPPM_COMMAND,
      pdfDpi: env.OCR_PDF_DPI,
      pdfMaxPages: env.OCR_PDF_MAX_PAGES,
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
      .select("product_id, document_type, display_name, is_required, notes, accepted_formats")
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
        notes: toStringOrNull(row.notes),
        accepted_formats: toStringArray(row.accepted_formats),
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
  const latestRowsByType = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = String(row.document_type ?? "").trim().toLowerCase();
    if (!key || latestRowsByType.has(key)) {
      continue;
    }
    latestRowsByType.set(key, row);
  }
  const latestRows = Array.from(latestRowsByType.values());
  const extractor = buildConfiguredExtractor(profile, application);

  let scannedCount = 0;
  const workingDocs: WorkingDocument[] = [];

  for (const row of latestRows) {
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
    const declaredTypeCanonical = canonicalizeDocumentType(typedRow.document_type) ?? normalizeText(typedRow.document_type);

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
        const inferredTypeFromFields = inferDocumentTypeFromFields(extractedFields);
        if (!detectedDocType && inferredTypeFromFields) {
          detectedDocType = inferredTypeFromFields;
        }
        if (declaredTypeCanonical === "nic" && toStringOrNull(extractedFields.nic_number)) {
          detectedDocType = detectedDocType ?? "nic";
          confidenceScore = Math.max(confidenceScore, 72);
        }
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
        notes = ["AI guidance could not be completed for this file.", `Scan error: ${safeErrorMessage}`];
      }
    } else {
      const parsedFields = extractKeyFieldsFromText(ocrText);
      extractedFields = mergeExtractedFields(extractedFields, parsedFields);
      const inferredTypeFromFields = inferDocumentTypeFromFields(extractedFields);
      detectedDocType = typedRow.detected_doc_type ?? toStringOrNull(extractedFields.detected_doc_type);
      if (!detectedDocType && inferredTypeFromFields) {
        detectedDocType = inferredTypeFromFields;
      }
      confidenceScore = rounded(toNumber(extractedFields.confidence_score, 0));
      notes = ["Using previously scanned data."];
    }

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
    const verificationDisabled = doc.declaredTypeCanonical === "collateral_deed";
    if (verificationDisabled) {
      notes.push("Collateral documents are stored for reference. AI guidance is limited at this stage.");
    }

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

    const requiredFields = verificationDisabled
      ? []
      : requiredFieldsForType(doc.declaredTypeCanonical, detectedTypeCanonical);

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

    const fullNameDoc = toStringOrNull(doc.extractedFields.full_name);
    if (doc.declaredTypeCanonical === "nic" && fullNameDoc && profile.full_name && !valuesMatch("full_name", fullNameDoc, profile.full_name)) {
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
    if (doc.declaredTypeCanonical === "business_registration" && businessNameDoc && profile.business_name && !valuesMatch("business_name", businessNameDoc, profile.business_name)) {
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

    const computedMetrics = verificationDisabled ? {} : await buildAiComputedMetrics({
      declaredType: doc.declaredTypeCanonical,
      ocrText: doc.extractedText,
    });
    if (computedMetrics.bank_statement) {
      doc.extractedFields.total_deposits = computedMetrics.bank_statement.total_deposits;
      doc.extractedFields.monthly_average_balance = computedMetrics.bank_statement.monthly_average_balance;
      doc.extractedFields.statement_period_months = computedMetrics.bank_statement.period_months;
      notes.push(
        `Bank statement totals: deposits=${computedMetrics.bank_statement.total_deposits ?? "unavailable"}, monthly average balance=${computedMetrics.bank_statement.monthly_average_balance ?? "unavailable"}.`,
      );
      if (computedMetrics.bank_statement.total_deposits == null) {
        discrepancies.push(
          makeDiscrepancy({
            code: "BANK_STATEMENT_TOTAL_DEPOSITS_MISSING",
            field: "total_deposits",
            extractedValue: null,
            expectedValue: "calculated total deposits",
            difference: "Could not calculate total deposits from the bank statement.",
            severity: "minor",
            confidence: clamp(doc.confidenceScore, 20, 90),
            source: "ai",
          }),
        );
      }
      if (computedMetrics.bank_statement.monthly_average_balance == null) {
        discrepancies.push(
          makeDiscrepancy({
            code: "BANK_STATEMENT_MONTHLY_AVERAGE_BALANCE_MISSING",
            field: "monthly_average_balance",
            extractedValue: null,
            expectedValue: "calculated monthly average balance",
            difference: "Could not calculate monthly average balance from the bank statement.",
            severity: "minor",
            confidence: clamp(doc.confidenceScore, 20, 90),
            source: "ai",
          }),
        );
      }
    }
    if (computedMetrics.financial_statements) {
      doc.extractedFields.annual_net_profit = computedMetrics.financial_statements.annual_net_profit;
      doc.extractedFields.fiscal_year = computedMetrics.financial_statements.fiscal_year;
      notes.push(
        `Financial statements: annual net profit=${computedMetrics.financial_statements.annual_net_profit ?? "unavailable"} for fiscal year ${computedMetrics.financial_statements.fiscal_year ?? "unknown"}.`,
      );
      if (computedMetrics.financial_statements.annual_net_profit == null) {
        discrepancies.push(
          makeDiscrepancy({
            code: "FINANCIAL_STATEMENT_ANNUAL_NET_PROFIT_MISSING",
            field: "annual_net_profit",
            extractedValue: null,
            expectedValue: "annual net profit for most recent fiscal year",
            difference: "Could not extract annual net profit from the financial statements.",
            severity: "minor",
            confidence: clamp(doc.confidenceScore, 20, 90),
            source: "ai",
          }),
        );
      }
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

    for (const field of verificationDisabled ? [] : CONSISTENCY_FIELDS) {
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
          difference: "OCR extraction failed, so AI guidance could not be completed for this file.",
          severity: "critical",
          confidence: 100,
          source: "ocr",
        }),
      );
    }

    if (!verificationDisabled && doc.confidenceScore < 55) {
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
    const aiDocumentAnalysis = await buildAiDocumentAnalysis({
      fileName: doc.row.file_name,
      declaredType: doc.declaredTypeCanonical,
      detectedType: detectedTypeCanonical,
      ocrText: doc.extractedText,
      extractedFields: doc.extractedFields,
      requirementTitle: doc.requiredRule?.display_name ?? formatDocumentTypeLabel(doc.declaredTypeCanonical),
      requirementNotes: doc.requiredRule?.notes ?? null,
      acceptedFormats: doc.requiredRule?.accepted_formats ?? ["pdf", "jpg", "jpeg", "png"],
    });

    const extractedFieldsToStore = mergeExtractedFields(doc.extractedFields, {
      discrepancy_report: discrepancyReport,
      ai_discrepancy_summary: aiSummary,
      ai_document_analysis: aiDocumentAnalysis,
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
      `Guidance items noted: ${discrepancies.length} (critical: ${criticalCount}, minor: ${minorCount}).`,
      aiDocumentAnalysis.summary,
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
      ai_document_analysis: aiDocumentAnalysis,
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
    const rejected = summaries.filter((doc) => doc.final_verification_status === "Rejected").length;
    const needsReview = summaries.filter((doc) => doc.final_verification_status === "Needs Review").length;

    return [
      `Processed ${summaries.length} uploaded document(s).`,
      `Clear matches: ${verified}, needs attention: ${rejected}, pending analysis: ${needsReview}.`,
      `Guidance items: ${critical} critical and ${minor} minor.`,
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
