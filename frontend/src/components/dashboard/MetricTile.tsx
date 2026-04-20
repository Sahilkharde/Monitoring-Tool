import clsx from 'clsx';

const accents = {
  indigo: 'border-l-indigo-500 bg-indigo-500/[0.06]',
  red: 'border-l-red-500 bg-red-500/[0.06]',
  cyan: 'border-l-cyan-500 bg-cyan-500/[0.06]',
  emerald: 'border-l-emerald-500 bg-emerald-500/[0.06]',
  amber: 'border-l-amber-500 bg-amber-500/[0.06]',
  violet: 'border-l-violet-500 bg-violet-500/[0.06]',
} as const;

type Accent = keyof typeof accents;

function valueColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return 'text-zinc-500';
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

interface MetricTileProps {
  label: string;
  /** Raw numeric score (for coloring) */
  score?: number | null;
  /** Display value (e.g. formatted number) */
  display?: string;
  hint?: string;
  accent: Accent;
  badge?: { text: string; ok: boolean };
}

/**
 * Sonar-style measure tile: left accent, uppercase label, large numeric value.
 */
export default function MetricTile({ label, score, display, hint, accent, badge }: MetricTileProps) {
  const num =
    display ??
    (score != null && !Number.isNaN(score) ? score.toFixed(1) : '—');

  return (
    <div
      className={clsx(
        'rounded-xl border border-[var(--border)] border-l-4 pl-4 pr-3 py-4 shadow-sm transition-colors',
        'hover:border-[var(--border-strong)]',
        accents[accent],
      )}
      style={{ background: 'var(--bg-secondary)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className={clsx('text-3xl font-bold tabular-nums tracking-tight sm:text-4xl', valueColor(score ?? null))}>
          {num}
        </span>
        {badge && (
          <span
            className={clsx(
              'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
              badge.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
            )}
          >
            {badge.text}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs leading-snug text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}
