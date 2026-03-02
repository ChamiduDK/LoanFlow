import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function listModels() {
  const apiKey = process.env.AI_CHAT_GEMINI_API_KEY || process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API key found in .env");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  console.log("Using API Key:", apiKey.slice(0, 5) + "...");

  // Test a few common models
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp"
  ];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = "echo: test";
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[OK] ${modelName}: ${text.slice(0, 20)}`);
    } catch (err: any) {
      console.log(`[FAIL] ${modelName}: ${err.message}`);
    }
  }
}

listModels().catch(err => console.error("Unhandled error:", err));
