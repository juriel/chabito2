import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { embed } from "@mariozechner/pi-agent-core";
import { Database } from "bun:sqlite";

type KnowledgeRecord = {
  uuid: string;
  summary: string;
  keywords: string[];
  content: string;
};

type KnowledgeUpdate = Partial<Pick<KnowledgeRecord, "summary" | "keywords" | "content">>;

type SearchResult = {
  uuid: string;
  summary: string;
  score: number;
};

function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatKeywords(keywords: string[]): string {
  return keywords.map((k) => k.trim()).filter(Boolean).join(", ");
}

function parseKnowledgeFile(text: string): KnowledgeRecord {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const l0 = lines[0] ?? "";
  const l1 = lines[1] ?? "";
  const l2 = lines[2] ?? "";

  const readValue = (line: string) => {
    const idx = line.indexOf(":");
    if (idx === -1) return "";
    return line.slice(idx + 1).trim();
  };

  const uuid = readValue(l0);
  const summary = readValue(l1);
  const keywords = parseKeywords(readValue(l2));

  const delimiterIndex = lines.findIndex((l) => l.trim() === "---");
  const contentStart = delimiterIndex === -1 ? 4 : delimiterIndex + 1;
  const content = lines.slice(contentStart).join("\n").trimEnd();

  return { uuid, summary, keywords, content };
}

function serializeKnowledgeFile(record: KnowledgeRecord): string {
  return [
    `uuid: ${record.uuid}`,
    `summary: ${record.summary ?? ""}`,
    `keywords: ${formatKeywords(record.keywords ?? [])}`,
    "",
    "---",
    "",
    record.content ?? "",
    "",
  ].join("\n");
}

function toNumberArray(vec: unknown): number[] {
  if (Array.isArray(vec)) return vec.map((x) => Number(x));
  if (vec instanceof Float32Array) return Array.from(vec);
  if (vec && typeof (vec as any)[Symbol.iterator] === "function") return Array.from(vec as any).map(Number);
  throw new Error("Unexpected embedding vector type");
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function embedText(text: string): Promise<number[]> {
  // `embed()` can return `number[]`, `Float32Array`, or similar iterable.
  const vec = await (embed as any)(text);
  return toNumberArray(vec);
}

function safeParseEmbedding(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map((x) => Number(x)) : null;
  } catch {
    return null;
  }
}

export class RAGMemory {
  private db: Database;
  private chatDir: string;
  private knowledgeDir: string;

  constructor(options: { chatUuid: string; baseDir?: string }) {
    const baseDir = options.baseDir ?? "data";
    this.chatDir = path.join(baseDir, options.chatUuid);
    this.knowledgeDir = path.join(this.chatDir, "knowledge");

    fs.mkdirSync(this.knowledgeDir, { recursive: true });

    const dbPath = path.join(this.chatDir, "db.sqlite");
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
      uuid TEXT PRIMARY KEY,
      embedding_summary TEXT,
      embedding_keywords TEXT,
      embedding_content TEXT
    )`);
  }

  private knowledgePath(uuid: string): string {
    return path.join(this.knowledgeDir, `${uuid}.md`);
  }

  async create(summary: string, keywords: string[] | string, content: string): Promise<string> {
    const uuid = randomUUID();
    const keywordList = Array.isArray(keywords) ? keywords : parseKeywords(keywords);

    const record: KnowledgeRecord = { uuid, summary, keywords: keywordList, content };
    await fsp.writeFile(this.knowledgePath(uuid), serializeKnowledgeFile(record), "utf8");

    const [embeddingSummary, embeddingKeywords, embeddingContent] = await Promise.all([
      embedText(summary ?? ""),
      embedText(formatKeywords(keywordList)),
      embedText(content ?? ""),
    ]);

    this.db
      .query(
        `INSERT INTO embeddings (uuid, embedding_summary, embedding_keywords, embedding_content)
         VALUES (?, ?, ?, ?)`,
      )
      .run(uuid, JSON.stringify(embeddingSummary), JSON.stringify(embeddingKeywords), JSON.stringify(embeddingContent));

    return uuid;
  }

  async get(uuid: string): Promise<KnowledgeRecord> {
    const text = await fsp.readFile(this.knowledgePath(uuid), "utf8");
    const parsed = parseKnowledgeFile(text);
    if (!parsed.uuid) parsed.uuid = uuid;
    return parsed;
  }

  async update(uuid: string, patch: KnowledgeUpdate): Promise<void> {
    const current = await this.get(uuid);
    const next: KnowledgeRecord = {
      uuid,
      summary: patch.summary ?? current.summary,
      keywords: patch.keywords ?? current.keywords,
      content: patch.content ?? current.content,
    };

    await fsp.writeFile(this.knowledgePath(uuid), serializeKnowledgeFile(next), "utf8");

    const setParts: string[] = [];
    const params: any[] = [];

    if (patch.summary !== undefined) {
      const v = await embedText(next.summary ?? "");
      setParts.push("embedding_summary = ?");
      params.push(JSON.stringify(v));
    }
    if (patch.keywords !== undefined) {
      const v = await embedText(formatKeywords(next.keywords ?? []));
      setParts.push("embedding_keywords = ?");
      params.push(JSON.stringify(v));
    }
    if (patch.content !== undefined) {
      const v = await embedText(next.content ?? "");
      setParts.push("embedding_content = ?");
      params.push(JSON.stringify(v));
    }

    if (setParts.length === 0) return;

    params.push(uuid);
    this.db.query(`UPDATE embeddings SET ${setParts.join(", ")} WHERE uuid = ?`).run(...params);
  }

  async search(query: string, top_k = 5): Promise<SearchResult[]> {
    const q = await embedText(query);

    const rows = this.db
      .query(
        `SELECT uuid, embedding_summary, embedding_keywords, embedding_content
         FROM embeddings`,
      )
      .all() as Array<{
      uuid: string;
      embedding_summary: string | null;
      embedding_keywords: string | null;
      embedding_content: string | null;
    }>;

    const scored: Array<{ uuid: string; score: number }> = [];
    for (const row of rows) {
      const es = safeParseEmbedding(row.embedding_summary);
      const ek = safeParseEmbedding(row.embedding_keywords);
      const ec = safeParseEmbedding(row.embedding_content);

      const simSummary = es ? cosineSimilarity(q, es) : Number.NEGATIVE_INFINITY;
      const simKeywords = ek ? cosineSimilarity(q, ek) : Number.NEGATIVE_INFINITY;
      const simContent = ec ? cosineSimilarity(q, ec) : Number.NEGATIVE_INFINITY;

      const score = Math.max(simSummary, simKeywords, simContent);
      scored.push({ uuid: row.uuid, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(0, top_k));

    const results: SearchResult[] = [];
    for (const item of top) {
      const k = await this.get(item.uuid);
      results.push({ uuid: item.uuid, summary: k.summary, score: item.score });
    }

    return results;
  }

  async context(query: string, top_k = 5, options?: { maxChars?: number }): Promise<string> {
    const maxChars = options?.maxChars ?? 6000;
    const hits = await this.search(query, top_k);

    let out = "";
    for (const hit of hits) {
      const k = await this.get(hit.uuid);
      const chunk = `# ${k.summary}\n\n${k.content}\n\n`;
      if (out.length + chunk.length > maxChars) {
        out += chunk.slice(0, Math.max(0, maxChars - out.length));
        break;
      }
      out += chunk;
    }
    return out.trimEnd();
  }
}

// Usage example (tsx):
//   import { RAGMemory } from "./rag_memory.ts";
//   const mem = new RAGMemory({ chatUuid: "chat-123" });
//   const id = await mem.create("Coffee preferences", ["coffee", "milk"], "I like oat milk lattes.");
//   console.log(await mem.search("oat milk", 3));
