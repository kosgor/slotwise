"use client";

import Link from "next/link";

import { NavLinks } from "@/components/layout/nav-links";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type NavItem = { href: string; label: string };

/** Loaded on demand by MobileNav: Radix Dialog is not needed until the menu is opened. */
export default function MobileNavSheet({
  items,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  items: readonly NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-72"
        // The trigger is not a Radix SheetTrigger (it lives outside this lazy chunk),
        // so return focus to it manually, as WCAG expects for dialogs.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="px-2">
          <NavLinks items={items} onNavigate={close} className="flex-col items-stretch" />
        </nav>
        <div className="px-4">
          <Button asChild className="w-full">
            <Link href="/pros" onClick={close}>
              Book a session
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
