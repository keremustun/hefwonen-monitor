// Quiet hours: no urgent alarms at night, only normal notifications.
// Times are Dutch local time (GitHub runners use UTC, so convert explicitly).

/** Minutes since midnight in the given time zone. */
export function localMinutes(now: Date, timeZone = "Europe/Amsterdam"): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get("hour") * 60 + get("minute");
}

/** Parses "23:00-07:30" into [start, end] minutes. Empty string = no quiet hours. */
export function parseRange(range: string): [number, number] | null {
  const m = range.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

/** True if `now` falls in the range; the range may cross midnight. */
export function isQuiet(now: Date, range: string, timeZone?: string): boolean {
  const r = parseRange(range);
  if (!r) return false;
  const [start, end] = r;
  const t = localMinutes(now, timeZone);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}
