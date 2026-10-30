"use client";

import { MenuIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string };

const loadSheet = () => import("@/components/layout/mobile-nav-sheet");
const MobileNavSheet = dynamic(loadSheet, { ssr: false });

/**
 * The menu button is rendered immediately; the Radix sheet behind it (~25 KB) loads only when
 * the user is about to open it — on hover/focus/touch it is prefetched, on click it renders.
 */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prefetch = () => void loadSheet();

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      {mounted && (
        <MobileNavSheet
          items={items}
          open={open}
          onOpenChange={setOpen}
          returnFocusTo={triggerRef}
        />
      )}
    </>
  );
}
