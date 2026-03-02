import fs from "node:fs/promises";
import path from "node:path";
import { aiService } from "./ai.service";

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "data", "knowledge");
const INDEX_FILE = path.join(process.cwd(), "server", "data", "knowledge_index.json");

export interface Chunk {
  id: string;
  filename: string;
  content: string;
  embedding?: number[];
  metadata: {
    heading?: string;
    index: number;
  };
}

export class KnowledgeService {
  private chunks: Chunk[] = [];
  private isLoaded = false;

  private async ensureLoaded() {
    if (this.isLoaded) return;
    try {
      if (await fs.stat(INDEX_FILE).catch(() => false)) {
        const data = await fs.readFile(INDEX_FILE, "utf-8");
        this.chunks = JSON.parse(data);
      }
      this.isLoaded = true;
    } catch (error) {
      console.error("Failed to load knowledge index", error);
    }
  }

  private async saveIndex() {
    await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    await fs.writeFile(INDEX_FILE, JSON.stringify(this.chunks, null, 2));
  }

  async reindex() {
    // Ensure directory exists
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });

    const files = await fs.readdir(KNOWLEDGE_DIR);
    const newChunks: Chunk[] = [];

    for (const file of files) {
      if (file.endsWith(".md") || file.endsWith(".txt")) {
        const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8");
        const chunks = this.chunkText(content);

        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const embedding = await aiService.embedContent(chunkText);
          newChunks.push({
            id: `${file}-${i}`,
            filename: file,
            content: chunkText,
            embedding,
            metadata: { index: i }
          });
        }
      }
    }

    this.chunks = newChunks;
    await this.saveIndex();
    this.isLoaded = true;
    return this.chunks.length;
  }

  private chunkText(text: string): string[] {
    const targetSize = 2000; // ~500 tokens approximation
    const chunks: string[] = [];
    let current = "";

    // Split by double newline to preserve paragraph structure
    const paragraphs = text.split(/\n\n+/);
    for (const para of paragraphs) {
      if (current.length + para.length > targetSize && current.length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      current += para + "\n\n";
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
  }

  async retrieveRelevant(query: string, topK = 3): Promise<Chunk[]> {
    await this.ensureLoaded();
    if (this.chunks.length === 0) return [];

    const queryEmbedding = await aiService.embedContent(query);

    const scored = this.chunks.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding!)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.chunk);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

export const knowledgeService = new KnowledgeService();
