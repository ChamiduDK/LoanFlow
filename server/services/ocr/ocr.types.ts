import type { User } from "@supabase/supabase-js";

export type ScanValidationStatus = "valid" | "invalid" | "unclear";

export type ExtractedDocument = {
  text: string;
  confidenceScore: number;
  detectedType: string | null;
  extractedFields: Record<string, unknown>;
  warnings: string[];
  engine: "ocr" | "placeholder" | "azure_document_intelligence" | "google_vision" | "tesseract";
};

export type DetectionResult = {
  detectedType: string | null;
  score: number;
  matchedKeywords: string[];
};

export type StorageProbeResult = {
  exists: boolean;
  byteLength: number | null;
  detectedMimeType: string | null;
  issues: string[];
};

export type StorageObjectContent = StorageProbeResult & {
  bytes: Uint8Array | null;
};

export type AzureOcrConfig = {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  modelId: string;
  locale: string | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  requestTimeoutMs: number;
};

export type TesseractOcrConfig = {
  command: string;
  language: string;
  psm: number;
  oem: number;
  timeoutMs: number;
  pdfToPpmCommand: string;
  pdfDpi: number;
  pdfMaxPages: number;
};

export type GoogleVisionOcrConfig = {
  endpoint: string;
  apiKey: string;
  requestTimeoutMs: number;
  pdfToPpmCommand: string;
  pdfDpi: number;
  pdfMaxPages: number;
};

export type GeminiDocClassifierConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  minOcrChars: number;
  maxTextChars: number;
};

export type AiTypeClassification = {
  detectedType: string | null;
  confidenceScore: number;
  reason: string;
};

export type CommandRunOptions = {
  timeoutMs: number;
  cwd?: string;
};

export interface OcrExtractor {
  extract(input: {
    storageBucket: string;
    storagePath: string;
    mimeType: string | null;
    fileName: string;
    declaredType: string;
  }): Promise<ExtractedDocument>;
}
