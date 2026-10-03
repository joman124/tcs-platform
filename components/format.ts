import type { Frequency } from '@/src/engine';

export const fmt = (cents: number): string => {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  return `${sign}$${Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(a % 100).padStart(2, '0')}`;
};

/** "Goodrich, Glenn" -> "Glenn Goodrich"; "Lee, Dr." -> "Dr. Lee". */
export function displayName(name: string): string {
  const m = /^(.+?),\s*(.+)$/.exec(name);
  return m ? `${m[2]} ${m[1]}` : name;
}

/** Patient-facing wording for how often. */
export function freqText(f: Frequency, sessions: number): string {
  if (sessions === 1) return 'One time';
  if (f.kind === 'weekly') {
    const per = f.perWeek === 1 ? 'Once a week' : `${f.perWeek} times a week`;
    return `${per} for ${f.weeks} ${f.weeks === 1 ? 'week' : 'weeks'}`;
  }
  return f.spanWeeks ? `${sessions} sessions over ${f.spanWeeks} weeks` : `${sessions} sessions`;
}

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
