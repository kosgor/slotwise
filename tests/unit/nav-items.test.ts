import { describe, expect, it } from "vitest";

import { navItemsFor } from "@/components/layout/nav-items";

describe("main navigation", () => {
  it("pitches the pricing page to everyone who is not a provider yet", () => {
    for (const role of [null, "client"] as const) {
      expect(navItemsFor(role).map((i) => i.href)).toEqual(["/pros", "/pricing", "/#faq"]);
    }
  });

  it("gives a provider their dashboard in that place", () => {
    expect(navItemsFor("provider")).toContainEqual({ href: "/dashboard", label: "My dashboard" });
    expect(navItemsFor("provider").map((i) => i.href)).not.toContain("/pricing");
  });
});
