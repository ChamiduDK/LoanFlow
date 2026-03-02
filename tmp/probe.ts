import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function discover() {
  const apiKey = process.env.AI_CHAT_GEMINI_API_KEY || process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) return;

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro"
  ];

  console.log("Probing models...");
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("echo: ok");
      console.log(`[WORKING] ${m}: ${result.response.text().trim()}`);
    } catch (e: any) {
      console.log(`[FAILED] ${m}: ${e.message}`);
    }
  }
}

discover();
