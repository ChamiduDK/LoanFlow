import { spawn } from "node:child_process";
import { supabaseAdmin } from "../../lib/supabase/client";
import type { StorageObjectContent, StorageProbeResult, CommandRunOptions } from "./ocr.types";

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function truncateText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandRunOptions,
): Promise<{ stdout: string; stderr: string }> {
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

export function detectMimeTypeFromSignature(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  ) {
    return "application/pdf";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  return null;
}

export async function downloadStorageObjectContent(input: {
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
      issues: ["Document storage metadata is incomplete. AI guidance could not be completed for this file."],
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
      issues: ["Unable to read the uploaded file from storage. AI guidance could not be completed for this file."],
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

export function inferMimeTypeFromFileName(fileName: string): string | null {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  return null;
}

export function getTempExtension(mimeType: string | null, fileName: string): string {
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

export function isPdfMimeType(mimeType: string | null, fileName: string): boolean {
  return (mimeType ?? inferMimeTypeFromFileName(fileName)) === "application/pdf";
}
