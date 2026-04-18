import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { Finding } from '../../store/scanStore';

interface SeverityDonutProps {
  findings: Finding[];
}

const severityColors: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#6366f1',
  INFO: '#6b7280',
};

const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export default function SeverityDonut({ findings }: SeverityDonutProps) {
  const grouped = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const data = severityOrder
    .filter((s) => grouped[s])
    .map((s) => ({ name: s, value: grouped[s] }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--text-tertiary)] text-sm">
        No findings
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={severityColors[entry.name] ?? '#6b7280'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: 'var(--shadow-elevated)',
            }}
            formatter={(value: number, name: string) => [`${value} issues`, name]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="space-y-2 mt-2 px-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: severityColors[d.name] }}
              />
              <span className="text-[var(--text-secondary)] font-medium">{d.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-primary)] font-semibold">{d.value}</span>
              <span className="text-[var(--text-tertiary)] w-8 text-right">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
