// Splits a document into overlapping chunks for embeddings. Pure function, tested in
// tests/unit/ai-chunking.test.ts.
//
// Chunks follow the text's own structure: paragraphs first, then sentences, then words, so a rule
// like "cancel 24 hours before" is not cut in half. Consecutive chunks share an overlap, so a
// sentence near a boundary is searchable from both sides.

export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 150;

export type Chunk = { content: string; index: number };

/** Normalises line endings and whitespace; drops empty lines beyond paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pieces no longer than `max`: paragraphs, else sentences, else words, else hard cuts. */
function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= max) {
      out.push(paragraph);
      continue;
    }
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      if (sentence.length <= max) {
        out.push(sentence);
        continue;
      }
      let current = "";
      for (const word of sentence.split(" ")) {
        if (word.length > max) {
          if (current) out.push(current);
          current = "";
          for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
          continue;
        }
        if (current && current.length + 1 + word.length > max) {
          out.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current) out.push(current);
    }
  }
  return out.filter(Boolean);
}

/** The tail of `text` (at most `size` characters), starting at a word boundary. */
function tail(text: string, size: number): string {
  if (text.length <= size) return text;
  const cut = text.slice(text.length - size);
  const space = cut.indexOf(" ");
  return space === -1 ? cut : cut.slice(space + 1);
}

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Chunk[] {
  if (overlap >= size) throw new Error("overlap must be smaller than size");
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";
  // Pieces leave room for the overlap (and its line break) that starts every later chunk.
  for (const piece of pieces(normalized, size - overlap - 1)) {
    const joined = current ? `${current}\n${piece}` : piece;
    if (joined.length <= size) {
      current = joined;
      continue;
    }
    chunks.push(current);
    current = `${tail(current, overlap)}\n${piece}`;
  }
  if (current) chunks.push(current);
  return chunks.map((content, index) => ({ content, index }));
}
