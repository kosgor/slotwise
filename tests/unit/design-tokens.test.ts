import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTRAST_PAIRS, contrastRatio, parseOklch, readCssVariables } from "@/lib/design/contrast";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("contrastRatio", () => {
  it("matches the WCAG reference values for black and white", () => {
    const white = parseOklch("oklch(1 0 0)")!;
    const black = parseOklch("oklch(0 0 0)")!;
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme tokens", (_theme, selector) => {
  const vars = readCssVariables(css, selector);

  it.each(CONTRAST_PAIRS)("$usage: --$fg on --$bg ≥ $min:1", ({ fg, bg, min }) => {
    const fgColor = parseOklch(vars[fg] ?? "");
    const bgColor = parseOklch(vars[bg] ?? "");
    expect(fgColor, `--${fg} must be an opaque oklch() value`).not.toBeNull();
    expect(bgColor, `--${bg} must be an opaque oklch() value`).not.toBeNull();
    expect(contrastRatio(fgColor!, bgColor!)).toBeGreaterThanOrEqual(min);
  });
});
