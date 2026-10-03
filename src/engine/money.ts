/** All arithmetic is done in integer cents to avoid floating point drift. */
export const toCents = (dollars: number): number => Math.round(dollars * 100);

export const fromCents = (cents: number): number => cents / 100;

export function formatUSD(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** Divide cents by a positive number of weeks, rounding half up to the cent. */
export const divideCents = (cents: number, by: number): number => Math.round(cents / by);

/** Weekly -> monthly: 52 weeks / 12 months. */
export const WEEKS_PER_MONTH = 52 / 12;
export const weeklyToMonthlyCents = (weeklyCents: number): number => Math.round((weeklyCents * 52) / 12);
