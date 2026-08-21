import Image from "next/image";

/* The only photography allowed inside the operational portals (§4): a doctor's
   portrait beside their name in the booking flow and appointment card, where a
   face is functional — the patient recognises who they are seeing. Falls back
   to a monogram in the token palette when no photo is wired. */

const SIZES = {
  sm: 40,
  md: 56,
  lg: 72,
  xl: 96,
} as const;

/* Flipped on in the imagery pass once the 8 portraits are committed to
   public/images. Until then every call site falls back to a monogram. */
export const PORTRAITS_ENABLED = true;

/** Deterministic pick of one of the 8 committed portraits from a stable seed. */
export function portraitSrc(seed: string): string | undefined {
  if (!PORTRAITS_ENABLED) return undefined;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const n = (h % 8) + 1;
  return `/images/doctor-0${n}.webp`;
}

function initials(name: string): string {
  const parts = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "Dr";
}

export function DoctorPortrait({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  /** Pass a committed /images/doctor-0N.webp path to show a real photo. */
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  if (src) {
    return (
      <div
        className={`img-grade relative shrink-0 overflow-hidden rounded-md border border-ink-line ${className}`}
        style={{ width: px, height: px }}
      >
        <Image
          src={src}
          alt={`Portrait of ${name}`}
          width={px * 2}
          height={px * 2}
          sizes={`${px}px`}
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 30%" }}
        />
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md border border-clinical-line bg-clinical-wash font-display font-semibold text-clinical ${className}`}
      style={{ width: px, height: px, fontSize: px * 0.34 }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
