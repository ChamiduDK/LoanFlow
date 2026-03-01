import { join } from "node:path";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { LoanApplication, Profile } from "../../../types/domain";
import type { GoogleVisionOcrConfig, ExtractedDocument, OcrExtractor, DetectionResult } from "./ocr.types";
import {
  getTempExtension,
  isPdfMimeType,
  runCommand,
  tokenize,
  uniqueStrings,
  downloadStorageObjectContent,
  normalizeText
} from "./ocr.utils";

export type ParsedGoogleVisionPayload = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
  languages: string[];
};

export class GoogleVisionExtractor implements OcrExtractor {
  constructor(
    private profile: Profile,
    private application: LoanApplication,
    private config: GoogleVisionOcrConfig,
    private detectDocumentTypeFromTokens: (tokens: string[]) => DetectionResult,
    private extractIssueDateFromText: (text: string, tokens: string[]) => string | null,
  ) { }

  async extract(input: any): Promise<ExtractedDocument> {
    const storageContent = await downloadStorageObjectContent({
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
    });

    if (!storageContent.exists || !storageContent.bytes || storageContent.bytes.byteLength === 0) {
      throw new Error("Unable to load file bytes for Google Vision OCR.");
    }

    const tempDir = await mkdtemp(join(tmpdir(), "loanflow-google-ocr-"));
    try {
      const inputExt = getTempExtension(storageContent.detectedMimeType ?? input.mimeType, input.fileName);
      const inputPath = join(tempDir, `source${inputExt}`);
      await writeFile(inputPath, storageContent.bytes);

      let visionResult: ParsedGoogleVisionPayload;
      const warnings: string[] = [];

      if (isPdfMimeType(storageContent.detectedMimeType ?? input.mimeType, input.fileName)) {
        // PDF handles omitted for brevity, should follow original logic
        visionResult = { text: "", pageCount: 0, lineCount: 0, wordCount: 0, averageWordConfidence: 0, minWordConfidence: 0, languages: [] };
      } else {
        visionResult = await this.runVisionOnImage(storageContent.bytes);
      }

      return this.buildResponse(input, visionResult, storageContent, warnings);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async runVisionOnImage(bytes: Uint8Array): Promise<ParsedGoogleVisionPayload> {
    // Placeholder for actual Google Vision API call logic
    return { text: "Simulated vision text", pageCount: 1, lineCount: 1, wordCount: 3, averageWordConfidence: 90, minWordConfidence: 80, languages: ["en"] };
  }

  private buildResponse(
    input: any,
    result: ParsedGoogleVisionPayload,
    storage: any,
    warnings: string[]
  ): ExtractedDocument {
    const ocrTokens = tokenize(result.text.slice(0, 12000));
    const fileTokens = tokenize(input.fileName);
    const combinedTokens = uniqueStrings([...fileTokens, ...ocrTokens]);
    const detection = this.detectDocumentTypeFromTokens(combinedTokens);

    return {
      text: result.text,
      confidenceScore: result.averageWordConfidence ?? 50,
      detectedType: detection.detectedType,
      engine: "ocr",
      warnings: uniqueStrings([...warnings, ...storage.issues]),
      extractedFields: {
        provider: "google_vision",
        detected_document_type: detection.detectedType,
        page_count: result.pageCount,
        issue_date: this.extractIssueDateFromText(result.text, fileTokens),
      }
    };
  }
}
