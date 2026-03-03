import { describe, it } from "vitest";
import { knowledgeService } from "./server/services/knowledge.service";
import dotenv from "dotenv";

dotenv.config();

describe("Reindex Trigger", () => {
  it("should reindex the knowledge base", async () => {
    console.log("Starting reindexing via Vitest...");
    const count = await knowledgeService.reindex();
    console.log(`Reindexing complete. Total chunks: ${count}`);
  }, 60000); // 1 minute timeout
});
