import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import dotenv from "dotenv";
import { knowledgeService } from "../services/knowledge.service";

// Load environment variables for AI service (embedding)
dotenv.config();

const DOCX_PATH = path.join(process.cwd(), "Sri Lankan Banks SME Loans - Requirements, Benefits & Approval Process.docx");
const OUTPUT_DIR = path.join(process.cwd(), "server", "data", "knowledge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "sme_loans_sl.md");

async function extract() {
  try {
    console.log(`🚀 Starting extraction from: ${DOCX_PATH}`);

    const result = await (mammoth as any).convertToMarkdown({ path: DOCX_PATH });
    const markdown = result.value;

    if (result.messages.length > 0) {
      console.warn("⚠️ Mammoth conversion messages:", result.messages);
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, markdown, "utf-8");
    console.log(`✅ Markdown saved to: ${OUTPUT_FILE}`);

    // Automatically trigger reindexing so the chatbot sees the changes
    console.log("🔄 Triggering knowledge reindexing...");
    const chunkCount = await knowledgeService.reindex();
    console.log(`✨ Reindexing complete! Created ${chunkCount} searchable chunks.`);

  } catch (error) {
    console.error("❌ Extraction or indexing failed:", error);
    process.exit(1);
  }
}

extract();
