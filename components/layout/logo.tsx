import Link from "next/link";

import { cn } from "@/lib/utils";

/** Links to the home page — "/" for everyone, "/admin" for admins (see HomeLogo in the header). */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md font-semibold tracking-tight",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-6 text-primary" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="4" fill="currentColor" opacity="0.15" />
        <rect x="3" y="4" width="18" height="5" rx="2" fill="currentColor" />
        <circle cx="12" cy="15" r="3" fill="currentColor" />
      </svg>
      <span>Slotwise</span>
    </Link>
  );
}
