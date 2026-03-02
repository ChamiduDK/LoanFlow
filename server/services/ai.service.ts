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
    try {
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      });

      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          temperature: 0.1, // Lower temperature for more consistent tool calling
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
    } catch (error) {
      console.error("Gemini API Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to generate AI response: ${message}`);
    }
  }

  async embedContent(text: string): Promise<number[]> {
    try {
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error("Gemini Embedding Error:", error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }


}

// Lazily created on first use — does NOT throw at module load time
export const aiService = new AiService();
