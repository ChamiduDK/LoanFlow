import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from "../config/env";

export type ChatMessage = {
  role: "user" | "model";
  parts: { text: string }[];
};

export class AiService {
  private _genAI: GoogleGenerativeAI | null = null;
  private model: string;

  constructor() {
    this.model = env.AI_CHAT_MODEL;
  }

  private getGenAI(): GoogleGenerativeAI {
    if (!this._genAI) {
      const apiKey = env.AI_CHAT_GEMINI_API_KEY || env.DOCUMENT_AI_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key is not configured. Set AI_CHAT_GEMINI_API_KEY or DOCUMENT_AI_GEMINI_API_KEY in your .env file.");
      }
      this._genAI = new GoogleGenerativeAI(apiKey);
    }
    return this._genAI;
  }

  async generateChatResponseWithTools(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string,
    tools: any[]
  ): Promise<{ text: string; toolCalls?: any[] }> {
    return this.withRetry(async () => {
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      });

      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      });

      const result = await chatSession.sendMessage(userMessage);
      const response = result.response;
      const text = response.text() || "";
      const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

      return {
        text,
        toolCalls: call ? [call.functionCall] : undefined
      };
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes("429") || error?.message?.includes("Too Many Requests");
      if (isRateLimit && retries > 0) {
        console.warn(`Gemini Rate Limit (429). Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(fn, retries - 1, delay * 2);
      }

      console.error("Gemini API Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      const hint = isRateLimit ? " You have exceeded your free tier quota. Please wait a minute or upgrade your Gemini API plan." : "";
      throw new Error(`Gemini Error: ${message}${hint}`);
    }
  }


  async embedContent(text: string): Promise<number[]> {
    return this.withRetry(async () => {
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await model.embedContent(text);
      return result.embedding.values;
    });
  }



}

// Lazily created on first use — does NOT throw at module load time
export const aiService = new AiService();
