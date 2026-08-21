"use client";

import { useEffect, useState } from "react";
import { CLINIC_TIME_ZONE } from "@/lib/format-clinic-time";

/** The clinic's current wall-clock time, ticking, in Plex Mono. Renders the
    server-passed initial value first so there's no hydration flash. */
export function LiveClock({ initial, className = "" }: { initial: string; className?: string }) {
  const [time, setTime] = useState(initial);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={`font-tabular tabular-nums ${className}`} suppressHydrationWarning>
      {time}
    </span>
  );
}
