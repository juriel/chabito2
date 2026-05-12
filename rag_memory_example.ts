import { RAGMemory } from "./src/knowledge/rag_memory.ts";

async function main() {
  const mem = new RAGMemory({ chatUuid: "example-chat" });

  const uuid = await mem.create(
    "Coffee preferences",
    ["coffee", "milk", "oat milk"],
    "I like oat milk lattes. Avoid dairy if possible.",
  );

  console.log("created:", uuid);
  console.log("search:", await mem.search("oat milk", 5));
  console.log("context:\n", await mem.context("coffee", 3, { maxChars: 800 }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
