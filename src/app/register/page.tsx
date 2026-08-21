"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ErrorBanner, FieldError, Input, Label } from "@/components/ui";
import { Photo } from "@/components/media";
import { Wordmark } from "@/components/brand";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (form.password.length < 8) {
      setFieldErrors({ password: "Use at least 8 characters." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create your account.");
        return;
      }
      // Sign straight in and land on the patient portal.
      const result = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      if (result?.error) {
        router.push("/login");
        return;
      }
      router.push("/patient");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link href="/">
              <Wordmark size={30} />
            </Link>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">Create your account</h1>
          <p className="mt-1.5 text-sm text-ink-500">Book appointments and follow up on your care.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            {error && <ErrorBanner message={error} />}
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" required value={form.name} onChange={set("name")} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} invalid={!!fieldErrors.email} />
              {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} invalid={!!fieldErrors.password} />
              {fieldErrors.password ? <FieldError>{fieldErrors.password}</FieldError> : <p className="mt-1.5 text-xs text-ink-400">At least 8 characters.</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-clinical hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Photo panel */}
      <div className="relative hidden lg:block">
        <Photo
          src="/images/care-hands.webp"
          alt="A nurse noting details on a patient chart"
          width={1400}
          height={1800}
          sizes="50vw"
          className="absolute inset-0 h-full w-full"
          objectPosition="50% 45%"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-ink-900/10 to-ink-900/30" />
        <div className="absolute inset-0 flex flex-col justify-end p-10">
          <hr className="brass-rule mb-5 w-24" />
          <p className="max-w-sm font-display text-2xl font-medium leading-snug text-white">
            Your record, in one place.
          </p>
          <p className="mt-2 max-w-sm text-sm text-white/70">
            Every visit, prescription, and reminder — kept together and easy to find.
          </p>
        </div>
      </div>
    </div>
  );
}
