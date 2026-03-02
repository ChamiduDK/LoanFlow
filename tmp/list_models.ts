import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function listAll() {
  const apiKey = process.env.AI_CHAT_GEMINI_API_KEY || process.env.DOCUMENT_AI_GEMINI_API_KEY;
  if (!apiKey) return;

  // Note: listModels is not on the genAI object directly in all versions, 
  // sometimes you have to use the REST API manually.
  // But let's try to see if there's any info in the error response of a random model.

  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    await model.generateContent("test");
  } catch (e: any) {
    console.log("Full Error Output:");
    console.log(JSON.stringify(e, null, 2));
    console.log("Message:", e.message);
  }
}

listAll();
