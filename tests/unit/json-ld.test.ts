import { describe, expect, it } from "vitest";

import { faqJsonLd, providerJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { seedDetails } from "./fixtures";

describe("serializeJsonLd", () => {
  it("escapes < so user content cannot close the script tag", () => {
    const out = serializeJsonLd({ bio: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ bio: "</script><script>alert(1)</script>" });
  });
});

describe("faqJsonLd", () => {
  it("maps questions to schema.org FAQPage", () => {
    const data = faqJsonLd([{ question: "Q?", answer: "A." }]);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toEqual([
      { "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } },
    ]);
  });
});

describe("providerJsonLd", () => {
  it("describes the provider as a Person offering priced services", async () => {
    const provider = seedDetails("anna-yoga")!;
    const data = providerJsonLd(provider) as { "@type": string; makesOffer: { price: string }[] };
    expect(data["@type"]).toBe("Person");
    expect(data.makesOffer).toHaveLength(provider.services.length);
    expect(data.makesOffer[0]!.price).toMatch(/^\d+\.\d{2}$/);
  });
});
