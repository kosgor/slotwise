import { Logo } from "@/components/layout/logo";

// Minimal layout for sign-in pages: no navigation to distract from the form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center px-4 py-12 outline-none"
    >
      <Logo />
      <div className="mt-10 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
