import { describe, expect, it } from "vitest";

import { homeFor } from "@/lib/auth/home";

describe("home page after sign-in", () => {
  it("sends each role to its own area", () => {
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("provider")).toBe("/dashboard");
    expect(homeFor("client")).toBe("/account");
    // No profile row yet (just signed up): a client.
    expect(homeFor(null)).toBe("/account");
  });
});
