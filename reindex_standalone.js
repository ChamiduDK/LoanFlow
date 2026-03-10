
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const KNOWLEDGE_DIR = path.join(process.cwd(), "server", "data", "knowledge");
const INDEX_FILE = path.join(process.cwd(), "server", "data", "knowledge_index.json");
const API_KEY =
    process.env.AI_CHAT_GEMINI_API_KEY ||
    process.env.DOCUMENT_AI_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;

const logFile = path.join(process.cwd(), "reindex_log.txt");
fs.writeFileSync(logFile, "START SESSION\n");

function log(msg) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] ${msg}`;
    console.log(formattedMsg);
    fs.appendFileSync(logFile, formattedMsg + "\n");
}

async function main() {
    try {
        if (!API_KEY) {
            throw new Error("Missing Gemini API key. Set AI_CHAT_GEMINI_API_KEY, DOCUMENT_AI_GEMINI_API_KEY, or GEMINI_API_KEY.");
        }

        log("Init GenAI...");
        const genAI = new GoogleGenAI({ apiKey: API_KEY });

        async function embedWithFallback(text) {
            const models = ["gemini-embedding-001", "text-embedding-004", "embedding-001"];
            for (const m of models) {
                try {
                    log(`Trying model ${m}...`);
                    const res = await genAI.models.embedContent({ 
                        model: m, 
                        contents: text 
                    });
                    
                    if (res && res.embeddings && res.embeddings.length > 0) {
                        return res.embeddings[0].values;
                    } else if (res && res.embedding && res.embedding.values) {
                        return res.embedding.values;
                    }
                    throw new Error("Invalid response format from embedContent");
                } catch (e) {
                    const reason = e instanceof Error ? e.message : String(e);
                    log(`Model ${m} failed: ${reason}`);
                }
            }
            throw new Error("All embedding models failed");
        }

        function chunkText(text) {
            const targetSize = 2000;
            const chunks = [];
            let current = "";
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

        log("Reading files...");
        const files = fs.readdirSync(KNOWLEDGE_DIR);
        const newChunks = [];

        for (const file of files) {
            const filePath = path.join(KNOWLEDGE_DIR, file);
            if (fs.statSync(filePath).isFile() && (file.endsWith(".md") || file.endsWith(".txt"))) {
                log(`Processing ${file}...`);
                const content = fs.readFileSync(filePath, "utf-8");
                const chunks = chunkText(content);

                for (let i = 0; i < chunks.length; i++) {
                    const chunkText = chunks[i];
                    log(`  Chunk ${i+1}/${chunks.length}`);
                    const embedding = await embedWithFallback(chunkText);
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

        log(`Writing index to ${INDEX_FILE}`);
        fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
        fs.writeFileSync(INDEX_FILE, JSON.stringify(newChunks, null, 2));
        log("DONE!");
    } catch (err) {
        const reason = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        log(`FATAL ERROR: ${reason}`);
    }
}

main();
