// "Today" for the app, as an ISO date. Domain code never reads the clock itself:
// pages and routes call this once and pass the result in.

/** The calendar date of `now` in `timeZone` (Helsinki by default), as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date(), timeZone = 'Europe/Helsinki'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
