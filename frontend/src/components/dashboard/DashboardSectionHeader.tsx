import type { LucideIcon } from 'lucide-react';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/** Product-dashboard style section title (Sonar-like hierarchy). */
export default function DashboardSectionHeader({ eyebrow, title, description, icon: Icon }: Props) {
  return (
    <div className="mb-6 space-y-2">
      {eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          {eyebrow}
        </p>
      )}
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(99,102,241,0.08)] text-[var(--accent)]">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:text-xl">{title}</h2>
          {description && (
            <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
