/* Medication schedule as a horizontal 24-hour rail with dose markers (§6.4) —
   a drawn element from the app's own vocabulary, not a table. Server-safe. */

function doseHours(timesPerDay: number): number[] {
  const n = Math.max(1, Math.min(timesPerDay, 12));
  // Evenly centred across the day: for 3/day → 4:00, 12:00, 20:00.
  return Array.from({ length: n }, (_, i) => +(24 * ((i + 0.5) / n)).toFixed(2));
}

function label(h: number): string {
  const hr = Math.floor(h) % 24;
  const period = hr < 12 ? "a" : "p";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}${period}`;
}

export function DoseStrip({
  medicationName,
  dosage,
  timesPerDay,
  durationDays,
}: {
  medicationName: string;
  dosage?: string;
  timesPerDay: number;
  durationDays: number;
}) {
  const hours = doseHours(timesPerDay);
  return (
    <div className="rounded-md border border-ink-line bg-surface-base p-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="font-medium text-ink-900">
          {medicationName}
          {dosage && <span className="ml-2 font-tabular text-sm font-normal text-ink-500">{dosage}</span>}
        </p>
        <p className="font-tabular text-xs text-ink-500">
          {timesPerDay}×/day · {durationDays}d
        </p>
      </div>
      <div className="relative h-8">
        {/* the day track */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-sunken" />
        {/* quarter ticks */}
        {[6, 12, 18].map((h) => (
          <div key={h} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-line" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {/* dose markers */}
        {hours.map((h, i) => (
          <div key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(h / 24) * 100}%` }}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-surface-raised bg-clinical shadow-elev-1" title={`${label(h)} dose`} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-tabular text-[10px] text-ink-500">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  );
}
