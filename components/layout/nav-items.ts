import type { Role } from "@/lib/auth/session";

export type NavItem = { href: string; label: string };

/**
 * The main navigation. "For professionals" is the pitch to people who are not providers yet; a
 * provider gets their dashboard in that place instead (the pricing page stays reachable from the
 * footer and from billing, and shows them their own plan).
 */
export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return [
    { href: "/pros", label: "Find a professional" },
    role === "provider"
      ? { href: "/dashboard", label: "My dashboard" }
      : { href: "/pricing", label: "For professionals" },
    { href: "/#faq", label: "FAQ" },
  ];
}
