import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export type ChatMessage = {
  role: "user" | "model";
  parts: { text: string }[];
};

export class AiService {
  private _genAI: GoogleGenAI | null = null;
  private model: string;

  constructor() {
    this.model = env.AI_CHAT_MODEL || "gemini-2.5-flash";
  }

  private getGenAI(): GoogleGenAI {
    if (!this._genAI) {
      const apiKey = env.AI_CHAT_GEMINI_API_KEY || env.DOCUMENT_AI_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key is not configured. Set AI_CHAT_GEMINI_API_KEY or DOCUMENT_AI_GEMINI_API_KEY in your .env file.");
      }
      this._genAI = new GoogleGenAI({ apiKey });
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
      const ai = this.getGenAI();
      const parts = [{ text: userMessage }];

      const contents = [
        {
          role: "user",
          parts: [{ text: systemPrompt }]
        },
        ...history,
        {
          role: "user",
          parts: parts
        }
      ] as any[];

      const config: any = {
        temperature: 0.1,
      };

      if (tools && tools.length > 0) {
        config.tools = [{ functionDeclarations: tools }];
      }

      const response = await ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: config
      });

      const text = response.text;

      // Note: The new SDK still nests tool calls inside candidates[0].content.parts
      // or exposes a helper. If functionCall exists, return it.
      let toolCall = undefined;
      if (response.candidates && response.candidates.length > 0) {
        const part = response.candidates[0].content?.parts?.find(p => p.functionCall);
        if (part) {
          toolCall = part.functionCall;
        }
      }

      return {
        text: text || "",
        toolCalls: toolCall ? [toolCall] : undefined
      };
    });
  }

  async generateChatResponse(systemPrompt: string, history: ChatMessage[], userMessage: string): Promise<string> {
    const result = await this.generateChatResponseWithTools(systemPrompt, history, userMessage, []);
    return result.text;
  }

  async generateTextFromParts(
    systemPrompt: string,
    parts: Array<Record<string, unknown>>,
    overrides?: Record<string, unknown>,
  ): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getGenAI();
      const response = await ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: parts as any[],
          },
        ],
        config: {
          temperature: 0,
          systemInstruction: systemPrompt,
          ...(overrides ?? {}),
        } as any,
      });

      return response.text || "";
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
      const ai = this.getGenAI();
      const result = await ai.models.embedContent({
        model: env.AI_EMBED_MODEL,
        contents: text
      });
      // @google/genai returns result.embeddings[0].values
      // Assuming a single input string, the result has an embeddings array
      return result.embeddings?.[0]?.values || [];
    });
  }

}
// Lazily created on first use - does NOT throw at module load time
export const aiService = new AiService();
