
import { knowledgeService } from "./server/services/knowledge.service";
import dotenv from "dotenv";

dotenv.config();

async function verify() {
  console.log("--- KNOWLEDGE RETRIEVAL VERIFICATION START ---");

  const queries = [
    "What is the turnover threshold for a Micro SME in Sri Lanka?",
    "Tell me about the RE-MSME PLUS loan scheme.",
    "What are the SME loan requirements for Commercial Bank of Ceylon?",
    "What support does NEDA provide to SMEs?"
  ];

  for (const q of queries) {
    console.log(`\nQuery: ${q}`);
    try {
      const chunks = await knowledgeService.retrieveRelevant(q, 2);
      if (chunks.length > 0) {
        console.log(`Retrieved ${chunks.length} chunks.`);
        chunks.forEach((c, i) => {
          console.log(`Source ${i + 1}: ${c.filename}`);
          console.log(`Snippet: ${c.content.substring(0, 200)}...`);
        });
      } else {
        console.log("No relevant chunks found.");
      }
    } catch (err) {
      console.error(`Error retrieving for "${q}":`, err);
    }
  }

  console.log("\n--- KNOWLEDGE RETRIEVAL VERIFICATION END ---");
}

verify().catch(console.error);
