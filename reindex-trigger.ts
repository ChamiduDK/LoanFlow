import { knowledgeService } from "./server/services/knowledge.service.ts";
import path from "node:path";
import dotenv from "dotenv";

// Load environment variables for AI service
dotenv.config();


async function runReindex() {
  try {
    console.log("Starting reindexing...");
    const count = await knowledgeService.reindex();
    console.log(`Reindexing complete. Total chunks: ${count}`);
    // Wait a bit for everything to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (err) {
    console.error("Reindexing failed:", err);
  } finally {
    console.log("Exiting reindexing script.");
    process.exit(0);
  }
}

runReindex();

