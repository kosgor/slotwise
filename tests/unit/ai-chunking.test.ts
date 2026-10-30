import { describe, expect, it } from "vitest";

import { chunkText, normalizeText } from "@/lib/ai/chunking";

const sentence = (i: number) => `Rule number ${i} says something useful about sessions.`;

describe("chunkText", () => {
  it("returns nothing for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n \t ")).toEqual([]);
  });

  it("keeps a short document in one chunk", () => {
    expect(chunkText("Cancel up to 24 hours before.")).toEqual([
      { content: "Cancel up to 24 hours before.", index: 0 },
    ]);
  });

  it("never exceeds the chunk size and numbers chunks in order", () => {
    const text = Array.from({ length: 80 }, (_, i) => sentence(i)).join(" ");
    const chunks = chunkText(text, 300, 60);
    expect(chunks.length).toBeGreaterThan(5);
    for (const [i, c] of chunks.entries()) {
      expect(c.content.length).toBeLessThanOrEqual(300);
      expect(c.index).toBe(i);
    }
  });

  it("overlaps consecutive chunks, so text near a boundary is in both", () => {
    const text = Array.from({ length: 40 }, (_, i) => sentence(i)).join("\n\n");
    const chunks = chunkText(text, 300, 80);
    for (let i = 1; i < chunks.length; i++) {
      const previousTail = chunks[i - 1]!.content.slice(-40);
      expect(chunks[i]!.content).toContain(previousTail.slice(previousTail.indexOf(" ") + 1));
    }
  });

  it("splits on sentences, not in the middle of one, when sentences fit", () => {
    const text = Array.from({ length: 30 }, (_, i) => sentence(i)).join(" ");
    for (const c of chunkText(text, 300, 60)) {
      expect(c.content.trimEnd().endsWith(".")).toBe(true);
    }
  });

  it("cuts a single word longer than a chunk instead of looping forever", () => {
    const chunks = chunkText("x".repeat(2000), 300, 60);
    expect(chunks.length).toBeGreaterThan(6);
    expect(chunks.every((c) => c.content.length <= 300)).toBe(true);
  });

  it("covers every sentence of the document", () => {
    const parts = Array.from({ length: 50 }, (_, i) => sentence(i));
    const all = chunkText(parts.join(" "), 400, 100)
      .map((c) => c.content)
      .join(" ");
    for (const p of parts) expect(all).toContain(p);
  });

  it("rejects an overlap that is not smaller than the size", () => {
    expect(() => chunkText("text", 100, 100)).toThrow();
  });
});

describe("normalizeText", () => {
  it("unifies line endings and collapses blank lines and spaces", () => {
    expect(normalizeText("a\r\n\r\n\r\n\r\nb  \t c\r\nd")).toBe("a\n\nb c\nd");
  });
});
