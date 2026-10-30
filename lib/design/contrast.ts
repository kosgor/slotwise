// WCAG 2.x contrast for colors written as oklch() in app/globals.css.
// Math: OKLCH -> OKLab -> linear sRGB (Björn Ottosson's matrices) -> relative luminance.

export type Oklch = { l: number; c: number; h: number; alpha: number };

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?)?\s*\)$/;

export function parseOklch(value: string): Oklch | null {
  const match = OKLCH_RE.exec(value.trim());
  if (!match) return null;
  const [, l, c, h, alpha] = match;
  return {
    l: Number(l),
    c: Number(c),
    h: Number(h),
    alpha: alpha === undefined ? 1 : Number(alpha) / (value.includes("%") ? 100 : 1),
  };
}

function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = toLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads `--name: value;` declarations from one CSS block (e.g. `:root { ... }`). */
export function readCssVariables(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return {};
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);
  const vars: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

// Pairs the UI actually renders. Text needs 4.5:1 (WCAG 1.4.3), UI boundaries 3:1 (WCAG 1.4.11).
export const CONTRAST_PAIRS: { fg: string; bg: string; min: number; usage: string }[] = [
  { fg: "foreground", bg: "background", min: 4.5, usage: "Body text" },
  { fg: "card-foreground", bg: "card", min: 4.5, usage: "Text on cards" },
  { fg: "popover-foreground", bg: "popover", min: 4.5, usage: "Menus, dialogs" },
  { fg: "primary-foreground", bg: "primary", min: 4.5, usage: "Primary button" },
  { fg: "primary", bg: "background", min: 4.5, usage: "Links" },
  { fg: "secondary-foreground", bg: "secondary", min: 4.5, usage: "Secondary button, badges" },
  { fg: "muted-foreground", bg: "background", min: 4.5, usage: "Secondary text" },
  { fg: "muted-foreground", bg: "card", min: 4.5, usage: "Secondary text on cards" },
  { fg: "muted-foreground", bg: "muted", min: 4.5, usage: "Text on muted surfaces" },
  { fg: "accent-foreground", bg: "accent", min: 4.5, usage: "Highlighted surfaces" },
  { fg: "destructive", bg: "background", min: 4.5, usage: "Error text" },
  { fg: "success-foreground", bg: "success", min: 4.5, usage: "Success badge" },
  { fg: "warning-foreground", bg: "warning", min: 4.5, usage: "Warning badge" },
  { fg: "input", bg: "background", min: 3, usage: "Form field borders" },
  { fg: "ring", bg: "background", min: 3, usage: "Focus ring" },
];
