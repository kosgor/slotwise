import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Form-level result. role="alert" (errors) and role="status" (success) are announced by screen
 * readers as soon as the text appears, without moving focus.
 */
export function FormMessage({
  status,
  message,
  className,
}: {
  status: "idle" | "error" | "success";
  message?: string;
  className?: string;
}) {
  if (!message || status === "idle") return null;
  const isError = status === "error";
  const Icon = isError ? CircleAlertIcon : CircleCheckIcon;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex gap-2 rounded-lg border p-3 text-sm",
        isError ? "border-destructive/40 text-destructive" : "border-success/40 bg-success/10",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
