import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function check() {
  const apiKey = process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) return;
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ["gemini-2.0-flash", "gemini-1.5-flash-8b-latest"];
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("hi");
      console.log(`[OK] ${modelName}`);
    } catch (err: any) {
      console.log(`[FAIL] ${modelName}: ${err.message}`);
    }
  }
}
check();
