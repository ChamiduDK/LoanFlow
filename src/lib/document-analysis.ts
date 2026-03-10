type LooseRecord = Record<string, unknown>;

export type ParsedDocumentAnalysis = {
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

function toRecord(value: unknown): LooseRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : null;
}

export function parseDocumentAnalysis(value: unknown): ParsedDocumentAnalysis | null {
  const record = toRecord(value);
  const summary = toText(record.summary);
  if (!summary) {
    return null;
  }

  const extractedInformation = Array.isArray(record.extracted_information)
    ? record.extracted_information
      .map((item) => toRecord(item))
      .map((item) => ({
        label: toText(item.label),
        value: toText(item.value),
      }))
      .filter((item): item is { label: string; value: string } => Boolean(item.label && item.value))
    : [];

  const requirementMatch = Array.isArray(record.requirement_match)
    ? record.requirement_match
      .map((item) => toRecord(item))
      .map((item) => ({
        status: item.status === "match" ? "match" : "warning",
        message: toText(item.message),
      }))
      .filter((item): item is { status: "match" | "warning"; message: string } => Boolean(item.message))
    : [];

  return {
    document_type: toText(record.document_type) ?? "Document",
    extracted_information: extractedInformation,
    requirement_match: requirementMatch,
    summary,
    eligibility_hint: toText(record.eligibility_hint) ?? "This analysis is informational only and does not guarantee bank approval.",
    source: record.source === "gemini" ? "gemini" : "rule_engine",
  };
}
