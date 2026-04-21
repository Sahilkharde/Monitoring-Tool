import clsx from 'clsx';
import { useScanStore } from '../../store/scanStore';
import { formatScanPlatform } from '../../utils/scanPlatform';

const PLATFORM_ORDER: Record<string, number> = { desktop: 0, mweb: 1, both: 2 };

/**
 * When a run used Desktop + mWeb (shared `scan_group_id`), switch between the two reports.
 */
export default function ScanPlatformSwitcher({ className }: { className?: string }) {
  const currentScan = useScanStore((s) => s.currentScan);
  const scans = useScanStore((s) => s.scans);
  const loadScan = useScanStore((s) => s.loadScan);

  if (!currentScan?.scan_group_id) return null;

  const siblings = scans
    .filter((s) => s.scan_group_id === currentScan.scan_group_id)
    .sort(
      (a, b) =>
        (PLATFORM_ORDER[(a.platform || '').toLowerCase()] ?? 99) -
        (PLATFORM_ORDER[(b.platform || '').toLowerCase()] ?? 99),
    );

  if (siblings.length < 2) return null;

  return (
    <div className={clsx('inline-flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg-secondary)]', className)}>
      {siblings.map((s) => (
        <button
          key={s.scan_id}
          type="button"
          onClick={() => void loadScan(s.scan_id)}
          className={clsx(
            'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
            s.scan_id === currentScan.scan_id
              ? 'bg-[rgba(99,102,241,0.2)] text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
          )}
        >
          {formatScanPlatform(s.platform)}
        </button>
      ))}
    </div>
  );
}
