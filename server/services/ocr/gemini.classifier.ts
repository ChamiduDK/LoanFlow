import type { GeminiDocClassifierConfig, AiTypeClassification } from "./ocr.types";
import { normalizeText } from "./ocr.utils";

export class GeminiClassifier {
  constructor(private config: GeminiDocClassifierConfig) { }

  async classify(input: {
    declaredType: string;
    fileName: string;
    ocrText: string;
    candidateTypes: string[];
  }): Promise<AiTypeClassification> {
    // Gemini classification logic placeholder
    return {
      detectedType: input.declaredType,
      confidenceScore: 90,
      reason: "Matched declared type in simulation",
    };
  }
}
