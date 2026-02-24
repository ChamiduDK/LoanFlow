import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:8080"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_DOCS_BUCKET: z.string().default("loan-documents"),
  AGENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  ML_ASSETS_DIR: z.string().default("ml-artifacts"),
  OCR_PROVIDER: z.enum(["placeholder", "tesseract", "azure_document_intelligence"]).default("placeholder"),
  OCR_TESSERACT_COMMAND: z.string().min(1).default("tesseract"),
  OCR_TESSERACT_LANGUAGE: z.string().min(2).default("eng"),
  OCR_TESSERACT_PSM: z.coerce.number().int().min(0).max(13).default(3),
  OCR_TESSERACT_OEM: z.coerce.number().int().min(0).max(3).default(1),
  OCR_TESSERACT_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  OCR_PDFTOPPM_COMMAND: z.string().min(1).default("pdftoppm"),
  OCR_PDF_DPI: z.coerce.number().int().min(72).max(600).default(200),
  OCR_PDF_MAX_PAGES: z.coerce.number().int().min(1).max(200).default(10),
  OCR_AZURE_ENDPOINT: z.string().url().optional(),
  OCR_AZURE_API_KEY: z.string().min(16).optional(),
  OCR_AZURE_API_VERSION: z.string().min(4).default("2024-11-30"),
  OCR_AZURE_MODEL_ID: z.string().min(3).default("prebuilt-read"),
  OCR_AZURE_LOCALE: z.string().min(2).optional(),
  OCR_AZURE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  OCR_AZURE_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  OCR_AZURE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
