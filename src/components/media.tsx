import Image from "next/image";

/* Flipped on in the imagery pass once the .webp files are committed to
   public/images. Until then Photo renders an on-brand architectural
   placeholder (not a broken image), which also serves as the graceful
   fallback. Register A imagery only — portraits use PORTRAITS_ENABLED. */
export const PHOTOS_ENABLED = true;

/** Tiny blur placeholder (a warm neutral) shared by all photos (§4). */
export const BLUR =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='6'><rect width='8' height='6' fill='#dfe0da'/></svg>`
  ).toString("base64");

export function Photo({
  src,
  alt,
  width,
  height,
  sizes,
  priority = false,
  className = "",
  imgClassName = "",
  objectPosition,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  objectPosition?: string;
}) {
  // NB: no hardcoded `relative` here — callers control positioning (the hero
  // and split panels pass `absolute inset-0`), and `absolute` is enough of a
  // containing block for the img-grade ::after overlay.
  if (!PHOTOS_ENABLED) {
    return (
      <div className={`img-grade overflow-hidden bg-surface-base ${className}`}>
        <ArchPlaceholder />
      </div>
    );
  }
  return (
    <div className={`img-grade overflow-hidden bg-surface-base ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        placeholder="blur"
        blurDataURL={BLUR}
        className={`h-full w-full object-cover ${imgClassName}`}
        style={objectPosition ? { objectPosition } : undefined}
      />
    </div>
  );
}

/** Editorial architectural line-art in the token palette — an atrium with
    daylight. Deliberately abstract; reads as intentional, never as a gap. */
function ArchPlaceholder() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef0ec" />
          <stop offset="1" stopColor="#dfe2dc" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky)" />
      {/* light shafts */}
      {[40, 110, 190, 270, 350].map((x, i) => (
        <polygon key={i} points={`${x},0 ${x + 26},0 ${x - 30},300 ${x - 70},300`} fill="#ffffff" opacity="0.35" />
      ))}
      {/* colonnade */}
      {[30, 92, 154, 216, 278, 340].map((x) => (
        <rect key={x} x={x} y="60" width="10" height="240" fill="var(--ink-line-strong)" opacity="0.5" />
      ))}
      <rect x="0" y="52" width="400" height="8" fill="var(--ink-line-strong)" opacity="0.5" />
      <rect x="0" y="292" width="400" height="8" fill="var(--ink-line-strong)" opacity="0.5" />
      {/* horizon figures suggested */}
      <rect x="120" y="250" width="8" height="42" rx="4" fill="var(--clinical)" opacity="0.35" />
      <rect x="250" y="255" width="8" height="37" rx="4" fill="var(--clinical)" opacity="0.3" />
    </svg>
  );
}
