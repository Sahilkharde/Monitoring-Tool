import { motion } from 'framer-motion';

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  subtitle?: string;
}

const sizeConfig = {
  sm: { width: 90, stroke: 5, fontSize: 18, labelSize: 10, gap: 2 },
  md: { width: 140, stroke: 7, fontSize: 30, labelSize: 12, gap: 4 },
  lg: { width: 180, stroke: 9, fontSize: 40, labelSize: 14, gap: 6 },
};

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getScoreGlow(score: number): string {
  if (score >= 80) return 'rgba(16, 185, 129, 0.3)';
  if (score >= 50) return 'rgba(245, 158, 11, 0.3)';
  return 'rgba(239, 68, 68, 0.3)';
}

function getGradientId(label: string): string {
  return `gauge-gradient-${label.replace(/\s+/g, '-').toLowerCase()}`;
}

export default function ScoreGauge({ score, label, size = 'md', color, subtitle }: ScoreGaugeProps) {
  const cfg = sizeConfig[size];
  const resolvedColor = color ?? getScoreColor(score);
  const glowColor = getScoreGlow(score);
  const radius = (cfg.width - cfg.stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (progress / 100) * circumference;
  const center = cfg.width / 2;
  const gradId = getGradientId(label);

  const glowOpacity = size === 'lg' ? 0.2 : 0.32;
  const glowBlur = size === 'lg' ? 'blur-md' : 'blur-lg';

  return (
    <div className="flex flex-col items-center" style={{ gap: cfg.gap }}>
      <div className="relative" style={{ width: cfg.width, height: cfg.width }}>
        {/* Glow effect — toned down on large gauge so the header does not feel overloaded */}
        <div
          className={`absolute inset-2 rounded-full ${glowBlur}`}
          style={{ background: glowColor, opacity: glowOpacity }}
        />

        <svg width={cfg.width} height={cfg.width} className="-rotate-90">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={resolvedColor} />
              <stop offset="100%" stopColor={resolvedColor} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(99, 102, 241, 0.08)"
            strokeWidth={cfg.stroke}
          />
          {/* Progress ring */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={cfg.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1] }}
            style={{ filter: size === 'lg' ? `drop-shadow(0 0 4px ${glowColor})` : `drop-shadow(0 0 6px ${glowColor})` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-bold text-[var(--text-primary)]"
            style={{ fontSize: cfg.fontSize, lineHeight: 1 }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
          >
            {Math.round(score)}
          </motion.span>
          {subtitle && (
            <span
              className="font-semibold mt-0.5"
              style={{
                fontSize: Math.max(cfg.labelSize - 2, 9),
                color: resolvedColor,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-[var(--text-secondary)] font-medium text-center"
        style={{ fontSize: cfg.labelSize }}
      >
        {label}
      </span>
    </div>
  );
}
