import { join } from "node:path";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { LoanApplication, Profile } from "../../../types/domain";
import type {
  TesseractOcrConfig,
  ExtractedDocument,
  OcrExtractor,
  DetectionResult,
  StorageObjectContent,
} from "./ocr.types";
import {
  getTempExtension,
  isPdfMimeType,
  runCommand,
  tokenize,
  uniqueStrings,
  downloadStorageObjectContent,
  normalizeText
} from "./ocr.utils";

export type ParsedTesseractTsv = {
  text: string;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  averageWordConfidence: number | null;
  minWordConfidence: number | null;
};

type ExtractInput = {
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  fileName: string;
  declaredType: string;
};

type LineAggregate = {
  page: number;
  block: number;
  paragraph: number;
  line: number;
  words: string[];
};

export async function runTesseractOnImageAsTsv(input: {
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

  const lineMap = new Map<string, LineAggregate>();
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

export class TesseractExtractor implements OcrExtractor {
  constructor(
    private profile: Profile,
    private application: LoanApplication,
    private config: TesseractOcrConfig,
    private detectDocumentTypeFromTokens: (tokens: string[]) => DetectionResult,
    private extractIssueDateFromText: (text: string, tokens: string[]) => string | null,
  ) { }

  async extract(input: ExtractInput): Promise<ExtractedDocument> {
    const storageContent = await downloadStorageObjectContent({
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
    });

    if (!storageContent.exists || !storageContent.bytes || storageContent.bytes.byteLength === 0) {
      throw new Error("Unable to load file bytes for OCR processing.");
    }

    const tempDir = await mkdtemp(join(tmpdir(), "loanflow-tesseract-ocr-"));
    try {
      const inputExt = getTempExtension(storageContent.detectedMimeType ?? input.mimeType, input.fileName);
      const inputPath = join(tempDir, `source${inputExt}`);
      await writeFile(inputPath, storageContent.bytes);

      let tesseractResult: ParsedTesseractTsv;
      const warnings: string[] = [];

      if (isPdfMimeType(storageContent.detectedMimeType ?? input.mimeType, input.fileName)) {
        const outputPrefix = join(tempDir, "pdf-page");
        const pdfArgs = [
          "-png",
          "-r",
          String(this.config.pdfDpi),
          "-f", "1",
          "-l", String(this.config.pdfMaxPages),
          inputPath,
          outputPrefix,
        ];

        await runCommand(this.config.pdfToPpmCommand, pdfArgs, {
          timeoutMs: this.config.timeoutMs,
        });

        const files = (await readdir(tempDir))
          .filter((name) => /^pdf-page-\d+\.png$/i.test(name))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

        const pageResults: ParsedTesseractTsv[] = [];
        for (const file of files) {
          const pageResult = await runTesseractOnImageAsTsv({
            config: this.config,
            imagePath: join(tempDir, file),
          });
          pageResults.push(pageResult);
        }

        tesseractResult = this.aggregateTesseractResults(pageResults);
        if (files.length >= this.config.pdfMaxPages) {
          warnings.push(`Processed up to ${this.config.pdfMaxPages} page(s).`);
        }
      } else {
        tesseractResult = await runTesseractOnImageAsTsv({
          config: this.config,
          imagePath: inputPath,
        });
      }

      return this.buildResponse(input, tesseractResult, storageContent, warnings);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private aggregateTesseractResults(results: ParsedTesseractTsv[]): ParsedTesseractTsv {
    return {
      text: results.map((r) => r.text).join("\n\n").trim(),
      pageCount: results.reduce((acc, r) => acc + r.pageCount, 0),
      lineCount: results.reduce((acc, r) => acc + r.lineCount, 0),
      wordCount: results.reduce((acc, r) => acc + r.wordCount, 0),
      averageWordConfidence: results.length > 0
        ? results.reduce((acc, r) => acc + (r.averageWordConfidence ?? 0), 0) / results.length
        : null,
      minWordConfidence: results.length > 0
        ? Math.min(...results.map((r) => r.minWordConfidence ?? 100))
        : null,
    };
  }

  private buildResponse(
    input: ExtractInput,
    result: ParsedTesseractTsv,
    storage: StorageObjectContent,
    warnings: string[]
  ): ExtractedDocument {
    const ocrTokens = tokenize(result.text.slice(0, 12000));
    const fileTokens = tokenize(input.fileName);
    const combinedTokens = uniqueStrings([...fileTokens, ...ocrTokens]);
    const detection = this.detectDocumentTypeFromTokens(combinedTokens);

    // Simplification for brevity, full logic should be migrated
    const confidenceScore = result.averageWordConfidence ?? 50;

    return {
      text: result.text,
      confidenceScore,
      detectedType: detection.detectedType,
      engine: "ocr",
      warnings: uniqueStrings([...warnings, ...storage.issues]),
      extractedFields: {
        provider: "tesseract",
        detected_document_type: detection.detectedType,
        page_count: result.pageCount,
        word_count: result.wordCount,
        issue_date: this.extractIssueDateFromText(result.text, fileTokens),
      }
    };
  }
}
