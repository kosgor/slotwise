import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CONTRAST_PAIRS, contrastRatio, parseOklch, readCssVariables } from "./contrast";

export type ContrastRow = {
  usage: string;
  fg: string;
  bg: string;
  min: number;
  light: number;
  dark: number;
};

/** Reads app/globals.css at build time and computes the same ratios the unit test checks. */
export async function getContrastReport(): Promise<ContrastRow[]> {
  const css = await readFile(join(process.cwd(), "app/globals.css"), "utf8");
  const light = readCssVariables(css, ":root");
  const dark = readCssVariables(css, ".dark");
  const ratio = (vars: Record<string, string>, fg: string, bg: string) => {
    const a = parseOklch(vars[fg] ?? "");
    const b = parseOklch(vars[bg] ?? "");
    return a && b ? Math.round(contrastRatio(a, b) * 100) / 100 : 0;
  };
  return CONTRAST_PAIRS.map((pair) => ({
    ...pair,
    light: ratio(light, pair.fg, pair.bg),
    dark: ratio(dark, pair.fg, pair.bg),
  }));
}
