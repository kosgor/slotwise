// Shared by the FAQ section and its FAQPage JSON-LD, so the two never drift apart.
export const FAQ_ITEMS = [
  {
    question: "How do I book a session?",
    answer:
      "Open a professional's profile, pick a service, choose a free time slot and confirm. You will get an email confirmation and a reminder 24 hours before the session.",
  },
  {
    question: "Can I cancel or reschedule?",
    answer:
      "Yes. Cancellations more than 24 hours before the session are free and fully refunded. Later cancellations follow the professional's own policy shown on their profile.",
  },
  {
    question: "Are sessions online or in person?",
    answer:
      "Both. Each professional chooses what they offer; use the format filter in the catalog to see only online or only in-person sessions.",
  },
  {
    question: "How are professionals checked?",
    answer:
      "Every profile is reviewed by our team before it appears in the catalog. Reviews come only from clients who completed a booking.",
  },
  {
    question: "I am a professional. How much does Slotwise cost?",
    answer:
      "Listing and bookings are free on the Free plan. Pro adds unlimited services, the AI booking assistant and priority placement — see the pricing page.",
  },
] as const;
