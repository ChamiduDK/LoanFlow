import type { GeminiDocClassifierConfig, AiTypeClassification } from "./ocr.types";
import { normalizeText } from "./ocr.utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeComparable(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function candidateTokens(candidate: string): string[] {
  return Array.from(
    new Set(
      normalizeComparable(candidate)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  );
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

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Gemini classifier timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

function matchCandidate(rawType: string, candidates: string[]): string | null {
  const normalizedRaw = normalizeComparable(rawType);
  if (!normalizedRaw) return null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeComparable(candidate);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalizedRaw) return candidate;
    if (normalizedCandidate.includes(normalizedRaw)) return candidate;
    if (normalizedRaw.includes(normalizedCandidate)) return candidate;
  }

  return null;
}

export class GeminiClassifier {
  constructor(private config: GeminiDocClassifierConfig) {}

  private heuristicClassify(input: {
    fileName: string;
    ocrText: string;
    candidateTypes: string[];
  }): AiTypeClassification {
    const candidates = Array.from(
      new Set(
        input.candidateTypes
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );

    if (candidates.length === 0) {
      return {
        detectedType: null,
        confidenceScore: 0,
        reason: "No candidate document types available.",
      };
    }

    const corpus = normalizeComparable(`${input.fileName} ${input.ocrText}`);
    if (!corpus) {
      return {
        detectedType: null,
        confidenceScore: 5,
        reason: "Insufficient OCR text for type classification.",
      };
    }

    let best: { type: string | null; score: number; hitTokens: string[] } = {
      type: null,
      score: 0,
      hitTokens: [],
    };
    let secondBestScore = 0;

    for (const candidate of candidates) {
      const tokens = candidateTokens(candidate);
      if (tokens.length === 0) {
        continue;
      }

      const hits = tokens.filter((token) => corpus.includes(token));
      let score = hits.length / tokens.length;
      const normalizedCandidate = normalizeComparable(candidate);
      if (normalizedCandidate && corpus.includes(normalizedCandidate)) {
        score += 0.25;
      }
      score = clamp(score, 0, 1);

      if (score > best.score) {
        secondBestScore = best.score;
        best = {
          type: candidate,
          score,
          hitTokens: hits,
        };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    const ambiguity = Math.abs(best.score - secondBestScore);
    if (!best.type || best.score < 0.35 || ambiguity < 0.1) {
      return {
        detectedType: null,
        confidenceScore: clamp(Math.round(best.score * 55), 0, 55),
        reason: "Heuristic classifier could not identify a reliable type match.",
      };
    }

    const confidence = clamp(
      Math.round(40 + best.score * 45 + (input.ocrText.length > 300 ? 10 : 0)),
      0,
      95,
    );

    return {
      detectedType: best.type,
      confidenceScore: confidence,
      reason: `Heuristic match based on OCR keywords: ${best.hitTokens.join(", ") || "partial token overlap"}`,
    };
  }

  async classify(input: {
    declaredType: string;
    fileName: string;
    ocrText: string;
    candidateTypes: string[];
  }): Promise<AiTypeClassification> {
    const heuristic = this.heuristicClassify({
      fileName: input.fileName,
      ocrText: input.ocrText,
      candidateTypes: input.candidateTypes,
    });

    const candidates = Array.from(
      new Set(
        input.candidateTypes
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );

    if (!this.config.apiKey || input.ocrText.trim().length < this.config.minOcrChars || candidates.length === 0) {
      return {
        ...heuristic,
        reason: !this.config.apiKey
          ? `Gemini unavailable (missing API key). ${heuristic.reason}`
          : input.ocrText.trim().length < this.config.minOcrChars
            ? `OCR text too short for Gemini classification. ${heuristic.reason}`
            : heuristic.reason,
      };
    }

    try {
      const genAI = new GoogleGenerativeAI(this.config.apiKey);
      const model = genAI.getGenerativeModel({
        model: this.config.model,
      });

      const truncatedText = input.ocrText.slice(0, this.config.maxTextChars);
      const prompt = [
        "Classify document type from OCR text.",
        "Return strict JSON only, without markdown:",
        '{"detected_type": string | null, "confidence_score": number, "reason": string}',
        `Declared type: ${input.declaredType}`,
        `File name: ${input.fileName}`,
        `Candidate types: ${candidates.join(", ")}`,
        "OCR text:",
        truncatedText,
      ].join("\n");

      const result = await withTimeout(model.generateContent(prompt), this.config.timeoutMs);
      const raw = result.response.text();
      const parsed = extractJsonObject(raw);
      if (!parsed) {
        return {
          ...heuristic,
          reason: `Gemini response was not valid JSON. ${heuristic.reason}`,
        };
      }

      const rawDetectedType = typeof parsed.detected_type === "string" ? parsed.detected_type : null;
      const matchedDetectedType = rawDetectedType ? matchCandidate(rawDetectedType, candidates) : null;
      const confidence = clamp(
        Math.round(Number(parsed.confidence_score)),
        0,
        100,
      );
      const reason = typeof parsed.reason === "string" ? parsed.reason : "Gemini classification";

      const geminiResult: AiTypeClassification = {
        detectedType: matchedDetectedType,
        confidenceScore: Number.isFinite(confidence) ? confidence : 0,
        reason,
      };

      if (!geminiResult.detectedType) {
        return {
          ...heuristic,
          reason: `Gemini could not match a candidate type. ${heuristic.reason}`,
        };
      }

      if (
        heuristic.detectedType &&
        normalizeComparable(heuristic.detectedType) !== normalizeComparable(geminiResult.detectedType) &&
        heuristic.confidenceScore >= 65 &&
        geminiResult.confidenceScore < 80
      ) {
        return {
          ...heuristic,
          reason: `Gemini/heuristic conflict; using heuristic fallback. ${heuristic.reason}`,
        };
      }

      return geminiResult;
    } catch {
      return {
        ...heuristic,
        reason: `Gemini request failed. ${heuristic.reason}`,
      };
    }
  }
}
