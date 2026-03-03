import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

const DOCX_PATH = path.join(process.cwd(), "Sri Lankan Banks SME Loans - Requirements, Benefits & Approval Process.docx");
const OUTPUT_DIR = path.join(process.cwd(), "server", "data", "knowledge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "sme_loans_sl.md");

async function extract() {
  try {
    console.log(`Extracting from: ${DOCX_PATH}`);

    const result = await mammoth.convertToMarkdown({ path: DOCX_PATH });
    const markdown = result.value; // The generated markdown
    const messages = result.messages; // Any messages, such as warnings during conversion

    if (messages.length > 0) {
      console.warn("Mammoth messages:", messages);
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, markdown, "utf-8");

    console.log(`Successfully saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Extraction failed:", error);
    process.exit(1);
  }
}

extract();
