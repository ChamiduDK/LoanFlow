import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function listModels() {
  const apiKey = process.env.AI_CHAT_GEMINI_API_KEY || process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found in .env");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // Note: The public SDK doesn't have a direct listModels method that works the same way as the REST API
    // but we can try to get a model to see if it exists.
    // Actually, listing models usually requires a different approach or just trial and error.
    console.log("Using API Key:", apiKey.slice(0, 5) + "...");

    const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash-lite", "gemini-1.5-pro"];

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        // Try a tiny generation
        await model.generateContent("hi");
        console.log(`[OK] ${modelName}`);
      } catch (err: any) {
        console.log(`[FAIL] ${modelName}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
