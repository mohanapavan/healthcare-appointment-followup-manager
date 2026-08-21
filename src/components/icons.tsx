import type { SVGProps } from "react";

/* Hand-drawn line icons (Lucide-grammar) — no emoji, no clipart (§8). 1.5px
   stroke, round joins, currentColor so they inherit ink/semantic tones. */

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const AlertTriangle = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const Clock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const Lock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const Check = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 13l4 4L19 7" />
  </Svg>
);

export const X = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const Copy = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Svg>
);

export const ArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const ChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const Calendar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </Svg>
);

export const Stethoscope = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 3v6a5 5 0 0 0 10 0V3" />
    <path d="M6 3H4M16 3h-2" />
    <path d="M11 14v2a5 5 0 0 0 10 0v-1" />
    <circle cx="21" cy="13" r="2" />
  </Svg>
);

export const Pill = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(45 12 12)" />
    <path d="M8.5 8.5 15.5 15.5" />
  </Svg>
);

export const Shield = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    <path d="m9.5 12 1.8 1.8L15 10" />
  </Svg>
);

export const User = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
  </Svg>
);

export const RefreshCw = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 4v4h-4M3 20v-4h4" />
  </Svg>
);
