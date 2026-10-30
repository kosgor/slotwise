"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

// Background tints use design tokens only; picked deterministically from the name.
const TINTS = [
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-muted text-foreground",
] as const;

const SIZES = {
  md: { px: 48, className: "size-12 text-base" },
  lg: { px: 80, className: "size-20 text-2xl" },
} as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function tintFor(name: string) {
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TINTS[sum % TINTS.length];
}

/**
 * Provider photo via next/image, or an initials avatar when there is no photo or it fails to load.
 * The name is always shown next to the avatar, so the image is decorative (alt="") unless
 * the caller passes `alt` — e.g. the profile page, where the photo itself is content.
 */
export function ProviderAvatar({
  name,
  photoUrl,
  size = "md",
  alt = "",
  preload = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  alt?: string;
  /** Above-the-fold images: fetch early instead of lazily (Next.js 16 replaced `priority`). */
  preload?: boolean;
}) {
  const { px, className } = SIZES[size];
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <Image
        src={photoUrl}
        alt={alt}
        // Fixed-size image: width/height reserve space (no layout shift), and without `sizes`
        // Next.js generates exactly two variants — 1x and 2x for retina — not the 640 px original.
        width={px}
        height={px}
        preload={preload}
        // Also covers failures before hydration: next/image re-sets src after mount so the
        // error is not lost (see next/dist/client/image-component.js).
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      data-testid="avatar-initials"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
        tintFor(name),
      )}
    >
      {initials(name)}
    </span>
  );
}
