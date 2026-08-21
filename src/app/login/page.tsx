"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ErrorBanner, Input, Label } from "@/components/ui";
import { Photo } from "@/components/media";
import { Wordmark } from "@/components/brand";
import { Copy, Check } from "@/components/icons";

const DEMO = [
  { role: "Patient", email: "patient1@clinic.test", password: "Patient123!" },
  { role: "Doctor", email: "dr.nair@clinic.test", password: "Doctor123!" },
  { role: "Admin", email: "admin@clinic.test", password: "Admin123!" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("That email and password don't match our records.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  function fillDemo(d: (typeof DEMO)[number]) {
    setEmail(d.email);
    setPassword(d.password);
    navigator.clipboard?.writeText(`${d.email} / ${d.password}`).catch(() => {});
    setCopied(d.role);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Photo panel — hidden below 900px (§6.2) */}
      <div className="relative hidden lg:block">
        <Photo
          src="/images/care-consult.webp"
          alt="A clinician in conversation with a patient"
          width={1400}
          height={1800}
          sizes="50vw"
          priority
          className="absolute inset-0 h-full w-full"
          objectPosition="50% 40%"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-ink-900/10 to-ink-900/30" />
        <div className="absolute inset-0 flex flex-col justify-between p-10">
          <Link href="/">
            <Wordmark tone="inverse" size={30} />
          </Link>
          <div>
            <hr className="brass-rule mb-5 w-24" />
            <p className="max-w-sm font-display text-2xl font-medium leading-snug text-white">
              Care that keeps its appointments.
            </p>
            <p className="mt-2 max-w-sm text-sm text-white/70">
              Booking, follow-up, and reminders — coordinated, so nothing falls through.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Wordmark size={30} />
            </Link>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-500">Patient, doctor, and admin accounts all sign in here.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            {error && <ErrorBanner message={error} />}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500">
            New patient?{" "}
            <Link href="/register" className="font-medium text-clinical hover:underline">
              Create an account
            </Link>
          </p>

          {/* Demo credentials — one click fills + copies (§6.2) */}
          <div className="mt-8 rounded-md border border-ink-line bg-surface-sunken p-4">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Demo accounts</p>
            <div className="space-y-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  onClick={() => fillDemo(d)}
                  className="flex w-full items-center justify-between gap-3 rounded border border-ink-line bg-surface-overlay px-3 py-2 text-left text-sm shadow-elev-1 hover:border-clinical"
                >
                  <span>
                    <span className="font-medium text-ink-900">{d.role}</span>{" "}
                    <span className="font-tabular text-xs text-ink-500">{d.email}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-clinical">
                    {copied === d.role ? (
                      <>
                        <Check width={13} height={13} /> Filled
                      </>
                    ) : (
                      <>
                        <Copy width={13} height={13} /> Use
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
