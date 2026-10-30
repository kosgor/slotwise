"use client";

/**
 * Wraps GET forms so empty fields and default values do not end up in the URL:
 * `/pros?category=yoga` instead of `/pros?q=&category=yoga&city=&sort=recommended`.
 * Fields are disabled for the moment of submit (disabled fields are excluded from form data)
 * and re-enabled right after. Without JavaScript the form still works; proxy.ts then redirects
 * to the canonical URL.
 */
export function CleanGetForm({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  function stripEmpty(event: React.FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const disabled: (HTMLInputElement | HTMLSelectElement)[] = [];
    for (const el of Array.from(form.elements)) {
      if (
        !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) ||
        !el.name ||
        el.disabled
      )
        continue;
      if (el.value === "" || el.value === el.dataset.default) {
        el.disabled = true;
        disabled.push(el);
      }
    }
    setTimeout(() => disabled.forEach((el) => (el.disabled = false)));
  }

  return (
    <div className={className} onSubmitCapture={stripEmpty}>
      {children}
    </div>
  );
}
