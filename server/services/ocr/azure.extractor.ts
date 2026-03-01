import type { LoanApplication, Profile } from "../../../types/domain";
import type {
  AzureOcrConfig,
  ExtractedDocument,
  OcrExtractor,
  DetectionResult,
  StorageObjectContent,
} from "./ocr.types";
import {
  tokenize,
  uniqueStrings,
  downloadStorageObjectContent,
  normalizeText
} from "./ocr.utils";

export class AzureExtractor implements OcrExtractor {
  constructor(
    private profile: Profile,
    private application: LoanApplication,
    private config: AzureOcrConfig,
    private detectDocumentTypeFromTokens: (tokens: string[]) => DetectionResult,
    private extractIssueDateFromText: (text: string, tokens: string[]) => string | null,
  ) { }

  async extract(input: {
    storageBucket: string;
    storagePath: string;
    mimeType: string | null;
    fileName: string;
    declaredType: string;
  }): Promise<ExtractedDocument> {
    const storageContent = await downloadStorageObjectContent({
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
    });

    if (!storageContent.exists || !storageContent.bytes || storageContent.bytes.byteLength === 0) {
      throw new Error("Unable to load file bytes for Azure OCR.");
    }

    // Azure logic placeholder - should call runAzureDocumentAnalysis
    const azureResult: {
      text: string;
      pageCount: number;
      lineCount: number;
      wordCount: number;
      averageWordConfidence: number;
      minWordConfidence: number;
    } = { text: "Azure extracted text", pageCount: 1, lineCount: 1, wordCount: 5, averageWordConfidence: 95, minWordConfidence: 85 };

    return this.buildResponse(input, azureResult, storageContent, []);
  }

  private buildResponse(
    input: {
      storageBucket: string;
      storagePath: string;
      mimeType: string | null;
      fileName: string;
      declaredType: string;
    },
    result: {
      text: string;
      pageCount: number;
      lineCount: number;
      wordCount: number;
      averageWordConfidence: number;
      minWordConfidence: number;
    },
    storage: StorageObjectContent,
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
        provider: "azure",
        detected_document_type: detection.detectedType,
        page_count: result.pageCount,
        issue_date: this.extractIssueDateFromText(result.text, fileTokens),
      }
    };
  }
}
