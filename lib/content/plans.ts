// Display data for the pricing page. Real prices will live in Stripe (stage 3);
// limits are enforced on the server, never by hiding UI.
export type BillingPeriod = "monthly" | "yearly";

export type Plan = {
  id: "free" | "pro";
  name: string;
  description: string;
  priceCents: Record<BillingPeriod, number>;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Everything you need to start taking bookings.",
    priceCents: { monthly: 0, yearly: 0 },
    features: [
      "Public profile in the catalog",
      "Up to 3 services",
      "Online booking and payments",
      "Email confirmations and reminders",
      "20 AI assistant messages per day",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professionals who want to grow their practice.",
    // Yearly is billed once; shown per month on the card. 2 months free.
    priceCents: { monthly: 1900, yearly: 19000 },
    features: [
      "Everything in Free",
      "Unlimited services",
      "Priority placement in search",
      "AI assistant answers questions from your documents",
      "500 AI assistant messages per day",
      "Weekly booking summary",
    ],
    highlighted: true,
  },
];

export const YEARLY_DISCOUNT_LABEL = "2 months free";
