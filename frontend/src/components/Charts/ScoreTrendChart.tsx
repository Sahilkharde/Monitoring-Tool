import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

interface TrendPoint {
  date: string;
  overall: number;
  security: number;
  performance: number;
  code_quality: number;
}

interface ScoreTrendChartProps {
  data: TrendPoint[];
  timeRange?: '7d' | '30d' | '90d';
  onTimeRangeChange?: (range: '7d' | '30d' | '90d') => void;
}

const lineColors = {
  overall: '#8b5cf6',
  security: '#ef4444',
  performance: '#06b6d4',
  code_quality: '#10b981',
};

const ranges: Array<'7d' | '30d' | '90d'> = ['7d', '30d', '90d'];

export default function ScoreTrendChart({
  data,
  timeRange: controlledRange,
  onTimeRangeChange,
}: ScoreTrendChartProps) {
  const [internalRange, setInternalRange] = useState<'7d' | '30d' | '90d'>('30d');
  const activeRange = controlledRange ?? internalRange;

  const handleRangeChange = (r: '7d' | '30d' | '90d') => {
    setInternalRange(r);
    onTimeRangeChange?.(r);
  };

  const days = activeRange === '7d' ? 7 : activeRange === '30d' ? 30 : 90;
  const filtered = data.slice(-days);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">KPI Score Trend</h3>
        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border)' }}>
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeRange === r
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={filtered} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(99,102,241,0.1)' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(99,102,241,0.1)' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: 'var(--shadow-elevated)',
            }}
            labelStyle={{ color: 'var(--text-secondary)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          <ReferenceLine
            y={95}
            stroke="var(--text-tertiary)"
            strokeDasharray="6 4"
            label={{
              value: 'Target (95)',
              position: 'insideTopRight',
              fill: 'var(--text-tertiary)',
              fontSize: 10,
            }}
          />
          <Line type="monotone" dataKey="overall" stroke={lineColors.overall} strokeWidth={2.5} dot={false} name="Overall" />
          <Line type="monotone" dataKey="security" stroke={lineColors.security} strokeWidth={1.5} dot={false} name="Security" />
          <Line type="monotone" dataKey="performance" stroke={lineColors.performance} strokeWidth={1.5} dot={false} name="Performance" />
          <Line type="monotone" dataKey="code_quality" stroke={lineColors.code_quality} strokeWidth={1.5} dot={false} name="Code Quality" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
