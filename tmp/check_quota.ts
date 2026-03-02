import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function checkKey() {
  const apiKey = process.env.AI_CHAT_GEMINI_API_KEY || process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found in .env");
    return;
  }

  console.log("Using API Key:", apiKey.slice(0, 5) + "..." + apiKey.slice(-5));

  const ai = new GoogleGenAI({ apiKey });

  const models = [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b"
  ];

  for (const m of models) {
    console.log(`\nTesting ${m}...`);
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: "say hi"
      });
      console.log(`[OK] ${m}: Response received.`);
    } catch (e: any) {
      console.log(`[FAIL] ${m}: ${e.message}`);
    }
  }
}

checkKey();
