import clsx from 'clsx';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

const config: Record<Severity, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'bg-red-500/12 border border-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
  HIGH: { bg: 'bg-orange-500/12 border border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  MEDIUM: { bg: 'bg-amber-500/12 border border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-400' },
  LOW: { bg: 'bg-indigo-500/12 border border-indigo-500/20', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  INFO: { bg: 'bg-zinc-500/12 border border-zinc-500/20', text: 'text-zinc-400', dot: 'bg-zinc-400' },
};

export default function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const c = config[severity] ?? config.INFO;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', c.dot)} />
      {severity}
    </span>
  );
}
