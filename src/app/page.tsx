import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Photo } from "@/components/media";
import { Mark, Wordmark, INSTITUTION } from "@/components/brand";
import { AiDisclosure, Eyebrow } from "@/components/ui";
import { ArrowRight, Calendar, Clock, Shield, User } from "@/components/icons";
import { formatClinicDateTime } from "@/lib/format-clinic-time";

interface Stats {
  doctorsAvailableToday: number;
  doctorsTotal: number;
  specialisations: number;
  nextOpenSlot: string | null;
}

async function getStats(): Promise<Stats> {
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const res = await fetch(`${proto}://${host}/api/stats`, { cache: "no-store" });
    if (res.ok) return (await res.json()) as Stats;
  } catch {
    /* fall through to safe defaults — the landing must never crash on stats */
  }
  return { doctorsAvailableToday: 0, doctorsTotal: 0, specialisations: 0, nextOpenSlot: null };
}

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    if (session.user.role === "DOCTOR") redirect("/doctor");
    if (session.user.role === "ADMIN") redirect("/admin");
    redirect("/patient");
  }

  const stats = await getStats();
  const nextOpen = stats.nextOpenSlot
    ? formatClinicDateTime(stats.nextOpenSlot, { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "—";

  return (
    <div className="bg-surface-sunken">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Wordmark tone="inverse" size={32} />
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-white/90 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-white/95 px-4 py-2 text-sm font-semibold text-ink-900 shadow-elev-1 hover:bg-white"
            >
              Book an appointment
            </Link>
          </div>
        </div>
      </header>

      {/* 1 — Hero */}
      <section className="relative" style={{ height: "min(88vh, 900px)" }}>
        <Photo
          src="/images/hero-atrium.webp"
          alt="Daylight in the atrium of a modern hospital"
          width={2400}
          height={1600}
          sizes="100vw"
          priority
          className="absolute inset-0 h-full w-full"
          objectPosition="50% 35%"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/35 to-ink-900/45" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-14">
          <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Healthcare that keeps its appointments.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            Book a specialist, hold your slot, and get every follow-up and reminder in one place —
            at {INSTITUTION}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-md bg-clinical px-6 py-3 text-base font-semibold text-white shadow-elev-2 hover:bg-clinical-deep"
            >
              Book an appointment <ArrowRight width={18} height={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border border-white/40 bg-white/10 px-6 py-3 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20"
            >
              Staff sign-in
            </Link>
          </div>

          {/* live numbers on a brass rule (§6.1) */}
          <div className="mt-10 max-w-2xl">
            <hr className="brass-rule mb-4" />
            <dl className="grid grid-cols-3 gap-6">
              <LiveStat value={String(stats.doctorsAvailableToday)} label="doctors in clinic today" />
              <LiveStat value={String(stats.specialisations)} label="specialisations" />
              <LiveStat value={nextOpen} label="next open slot" small />
            </dl>
          </div>
        </div>
      </section>

      {/* 2 — How booking works, as a mini day rail */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Eyebrow>How booking works</Eyebrow>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-[-0.02em] text-ink-900">
          The doctor&rsquo;s real day, drawn to scale.
        </h2>
        <p className="mt-3 max-w-xl text-ink-500">
          No month grid. You see the actual day — booked time, leave, and open slots — and hold one
          for five minutes while you finish.
        </p>
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <MiniRail />
          <ol className="space-y-5">
            {[
              { icon: <User width={18} height={18} />, t: "Pick a specialist", d: "Filter by specialisation and see who's in clinic." },
              { icon: <Clock width={18} height={18} />, t: "Hold a slot", d: "Your slot is reserved for five minutes — the countdown runs on the slot itself." },
              { icon: <Calendar width={18} height={18} />, t: "Confirm & sync", d: "Confirmation email, calendar event, and reminders — handled." },
            ].map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-clinical-wash text-clinical">
                  {s.icon}
                </span>
                <div>
                  <p className="font-display font-semibold text-ink-900">
                    <span className="font-tabular text-clinical">{i + 1}.</span> {s.t}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3 — What happens around the visit (real AI surfaces) */}
      <section className="border-y border-ink-line bg-surface-base">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow>Around the visit</Eyebrow>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-[-0.02em] text-ink-900">
            A summary before you arrive, and after you leave.
          </h2>
          <p className="mt-3 max-w-xl text-ink-500">
            We prepare a summary for your doctor from your symptoms, and one for you from the visit
            notes. It never diagnoses — a clinician reviews everything.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-ink-line border-l-2 border-l-brass bg-surface-raised p-6 shadow-elev-1">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display font-semibold text-ink-900">Pre-visit summary</p>
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface-overlay px-2 py-0.5 text-xs font-semibold text-caution-ink ring-1 ring-caution-line">
                  Urgency: Medium
                </span>
              </div>
              <p className="text-sm text-ink-700">
                Reports three days of a dry cough with mild chest tightness on exertion; no fever. Worth
                checking recent exposure and reviewing the inhaler technique.
              </p>
              <AiDisclosure />
            </div>
            <div className="rounded-lg border border-ink-line border-l-2 border-l-brass bg-surface-raised p-6 shadow-elev-1">
              <p className="mb-3 font-display font-semibold text-ink-900">Visit summary</p>
              <p className="text-sm text-ink-700">
                Likely a mild viral bronchitis. Rest and fluids; a short course of the reliever inhaler as
                needed. Return if breathlessness worsens or a fever appears.
              </p>
              <div className="mt-3 rounded-md border border-ink-line bg-surface-base p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-900">Salbutamol inhaler</span>
                  <span className="font-tabular text-xs text-ink-500">2×/day · 5d</span>
                </div>
              </div>
              <AiDisclosure />
            </div>
          </div>
        </div>
      </section>

      {/* Reminders band — a photographic beat between sections (§4 imagery). */}
      <section className="relative h-64 overflow-hidden sm:h-72">
        <Photo
          src="/images/care-pharmacy.webp"
          alt="Medication being prepared at a pharmacy"
          width={2000}
          height={800}
          sizes="100vw"
          className="absolute inset-0 h-full w-full"
          objectPosition="50% 55%"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-900/85 via-ink-900/55 to-ink-900/20" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-center px-6">
          <hr className="brass-rule mb-4 w-20" />
          <p className="max-w-lg font-display text-2xl font-medium leading-snug text-white">
            Reminders scheduled from your prescription.
          </p>
          <p className="mt-2 max-w-md text-sm text-white/70">
            One message per dose window — generated when the prescription is written, not a nag that
            re-derives itself every night.
          </p>
        </div>
      </section>

      {/* 4 — Reliability, on the inverse surface */}
      <section className="bg-surface-inverse">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Eyebrow className="text-white/50">Built to not lose your booking</Eyebrow>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-[-0.02em] text-white">
            The parts you only notice when they fail.
          </h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            <Reliability
              figure="1 / 50"
              title="No double-booking"
              body="Fifty people can race for one slot; exactly one wins with a 201, the other 49 get a clean 409 and the next three open times. One row in the database."
            />
            <Reliability
              figure="1m · 5m · 25m · 2h · 12h"
              title="Nothing sent, then dropped"
              body="Email and calendar go through a transactional outbox with an exponential-backoff retry ladder, then a visible dead-letter — never a silent failure."
            />
            <Reliability
              figure="2-way"
              title="Calendar that stays in sync"
              body="Google events are created, rescheduled, and revoked with the booking. If consent lapses, the appointment still stands."
            />
          </div>
        </div>
      </section>

      {/* 5 — Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-14">
        <hr className="brass-rule mb-8" />
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <Mark size={28} />
              <span className="font-display text-sm font-semibold text-ink-900">{INSTITUTION}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-ink-500">
              A demonstration appointment &amp; follow-up manager. Not a real clinic — see the README and
              system-design write-up in the repository.
            </p>
          </div>
          <div className="text-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
              <Shield width={13} height={13} /> Demo accounts
            </p>
            <ul className="space-y-1 font-tabular text-ink-700">
              <li>patient1@clinic.test · Patient123!</li>
              <li>dr.nair@clinic.test · Doctor123!</li>
              <li>admin@clinic.test · Admin123!</li>
            </ul>
            <Link href="/login" className="mt-3 inline-flex items-center gap-1 font-body text-sm font-medium text-clinical hover:underline">
              Sign in <ArrowRight width={14} height={14} />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LiveStat({ value, label, small = false }: { value: string; label: string; small?: boolean }) {
  return (
    <div>
      <dd className={`numeral text-white ${small ? "text-2xl" : "text-4xl"}`}>{value}</dd>
      <dt className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-white/60">{label}</dt>
    </div>
  );
}

function Reliability({ figure, title, body }: { figure: string; title: string; body: string }) {
  return (
    <div>
      <div className="numeral text-2xl text-white">{figure}</div>
      <hr className="my-3 border-0 h-px bg-white/15" />
      <p className="font-display font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/60">{body}</p>
    </div>
  );
}

/** A horizontal miniature of the day rail — previews the signature element (§6.1). */
function MiniRail() {
  const slots = [
    { label: "9:00", state: "done" },
    { label: "9:30", state: "open" },
    { label: "10:00", state: "held" },
    { label: "10:30", state: "open" },
    { label: "11:00", state: "booked" },
    { label: "11:30", state: "open" },
  ] as const;
  return (
    <div className="rounded-lg border border-ink-line bg-surface-raised p-5 shadow-elev-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-tabular text-xs font-semibold text-ink-900">Dr. Meera Nair · today</span>
        <span className="font-tabular text-xs text-ink-500">Cardiology</span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {slots.map((s) => (
          <div key={s.label} className="text-center">
            <div
              className={`flex h-16 items-center justify-center rounded-md border text-center font-tabular text-[11px] ${
                s.state === "held"
                  ? "border-caution bg-caution-wash font-semibold text-caution-ink"
                  : s.state === "booked"
                    ? "border-ink-line bg-surface-base text-ink-500"
                    : s.state === "done"
                      ? "border-dashed border-ink-line text-ink-500"
                      : "border-clinical-line bg-surface-overlay text-clinical shadow-elev-1"
              }`}
            >
              {s.state === "held" ? "hold 4:32" : s.state === "booked" ? "booked" : s.state === "done" ? "—" : "open"}
            </div>
            <div className="mt-1 font-tabular text-[10px] text-ink-500">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 font-tabular text-xs text-caution-ink">
        <Clock width={12} height={12} /> 10:00 held — 4:32 left
      </p>
    </div>
  );
}
