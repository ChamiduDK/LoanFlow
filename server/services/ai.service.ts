import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from "../config/env";
import { internalError } from "../lib/errors";

export type ChatMessage = {
  role: "user" | "model";
  parts: { text: string }[];
};

export class AiService {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor() {
    const apiKey = env.AI_CHAT_GEMINI_API_KEY || env.DOCUMENT_AI_GEMINI_API_KEY;
    if (!apiKey) {
      throw internalError("Gemini API key is not configured for Chat or Document AI");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = env.AI_CHAT_MODEL;
  }

  async generateChatResponse(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string
  ): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
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
      throw internalError("Failed to generate AI response", error);
    }
  }
}

export const aiService = new AiService();
