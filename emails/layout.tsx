// Shared frame for all emails. Email clients support only a small subset of HTML and CSS, so
// React Email components render tables and inline styles. Accessibility in email:
// * lang and a real <h1>: screen readers announce the language and the main heading;
// * the preview text is what inboxes show next to the subject;
// * no information only in images or colour; the text reads fine with images off;
// * no forced background colours on text, so clients that invert colours (dark mode) stay readable.

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

import { absoluteUrl } from "../lib/site";

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, padding: "0 24px" }}>
          <Text style={{ fontSize: 18, fontWeight: 700, margin: "0 0 24px" }}>Slotwise</Text>
          <Heading as="h1" style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 16px" }}>
            {heading}
          </Heading>
          {children}
          <Hr style={{ margin: "32px 0 16px" }} />
          <Text style={{ fontSize: 12, lineHeight: "18px", color: "#6b7280" }}>
            You are receiving this email because of a booking on Slotwise, a demo project.{" "}
            <Link href={siteHref("/account")} style={{ color: "inherit" }}>
              Manage your bookings
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Definition list of booking details, as a simple table (email clients lack <dl> styling). */
export function Details({ rows }: { rows: [string, string][] }) {
  return (
    <Section style={{ margin: "16px 0" }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "4px 16px 4px 0", color: "#6b7280", whiteSpace: "nowrap" }}>
                {label}
              </td>
              <td style={{ padding: "4px 0", fontWeight: 600 }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 16, lineHeight: "24px", margin: "0 0 16px" }}>{children}</Text>;
}

/** A link styled as a button. A real link, so it works in every client and with images off. */
export function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <Link
        href={href}
        style={{
          display: "inline-block",
          padding: "12px 20px",
          borderRadius: 8,
          border: "2px solid #4f46e5",
          color: "#4f46e5",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

/** Absolute link for an email: same base as the site (lib/site.ts), so never localhost on Vercel. */
export const siteHref = (path: string): string => absoluteUrl(path);
