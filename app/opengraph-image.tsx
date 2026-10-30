import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

// Preview card for links shared in Slack, LinkedIn, Upwork messages. Generated at build time.
export const alt = `${site.name} — book independent professionals`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ImageResponse renders outside the browser and cannot read CSS variables, so the brand
// tokens are repeated here as hex (primary ≈ oklch(0.48 0.1 180), background ≈ oklch(0.99 0.004 95)).
const PRIMARY = "#00756f";
const BACKGROUND = "#fcfbf8";
const FOREGROUND = "#1f2430";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: BACKGROUND,
        color: FOREGROUND,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44, fontWeight: 700 }}
      >
        <div style={{ width: 64, height: 64, borderRadius: 16, background: PRIMARY }} />
        {site.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>
          Book the right professional, at a time that works for you
        </div>
        <div style={{ fontSize: 34, opacity: 0.7 }}>
          Tutors · Trainers · Coaches · Massage · Music
        </div>
      </div>
    </div>,
    size,
  );
}
