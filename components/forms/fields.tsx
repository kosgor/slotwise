import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Same wiring as FormField: label, hint and error linked via aria-describedby; aria-invalid on error.

function describedBy(id: string, hint?: string, error?: string) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

function HintAndError({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

export function TextareaField({
  label,
  name,
  hint,
  error,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  hint,
  error,
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        name={name}
        className="w-full"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  );
}

/** Native checkbox: submits "on" in FormData, works without JavaScript. */
export function CheckboxField({
  label,
  name,
  error,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: string; name: string; error?: string }) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          className="size-4 accent-primary"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
