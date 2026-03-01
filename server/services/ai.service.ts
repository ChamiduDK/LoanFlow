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

  async generateChatResponse(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string
  ): Promise<string> {
    try {
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
      });

      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      const result = await chatSession.sendMessage(userMessage);
      const response = result.response.text();

      if (!response) {
        throw new Error("Empty response from Gemini API");
      }

      return response;
    } catch (error) {
      console.error("Gemini API Error:", error);
      // Re-throw with a safe message
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to generate AI response: ${message}`);
    }
  }
}

// Lazily created on first use — does NOT throw at module load time
export const aiService = new AiService();
