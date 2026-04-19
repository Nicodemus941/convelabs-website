import React from 'react';

/**
 * TrendSparkline — compact inline-SVG sparkline for daily KPI series.
 *
 * Zero-dependency. Sized to sit inside a KPI card. Shows:
 *   - a smoothed line of the series
 *   - a tiny marker on the most-recent point
 *   - optional delta pill: first→last change, colored green/red
 *
 * Usage:
 *   <TrendSparkline values={[3000, 3100, 3400, 3396]} width={120} height={28} />
 */

interface TrendSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  showDelta?: boolean;
  ariaLabel?: string;
}

const TrendSparkline: React.FC<TrendSparklineProps> = ({
  values,
  width = 120,
  height = 28,
  strokeColor = '#B91C1C',
  showDelta = false,
  ariaLabel,
}) => {
  if (!values || values.length < 2) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const innerH = height - pad * 2;
  const xStep = (width - pad * 2) / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = pad + i * xStep;
      const y = pad + (innerH - ((v - min) / range) * innerH);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastX = pad + (values.length - 1) * xStep;
  const lastY = pad + (innerH - ((values[values.length - 1] - min) / range) * innerH);

  // Delta calculation: first non-zero value → last
  const firstNonZero = values.find(v => v !== 0) ?? values[0];
  const last = values[values.length - 1];
  const delta = last - firstNonZero;
  const deltaPct = firstNonZero !== 0 ? (delta / Math.abs(firstNonZero)) * 100 : 0;
  const deltaPositive = delta >= 0;

  return (
    <div className="inline-flex items-center gap-2" title={ariaLabel}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel || 'trend sparkline'}>
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r={2} fill={strokeColor} />
      </svg>
      {showDelta && firstNonZero !== 0 && (
        <span
          className={`text-[10px] font-semibold ${deltaPositive ? 'text-emerald-600' : 'text-red-600'}`}
        >
          {deltaPositive ? '▲' : '▼'}{Math.abs(deltaPct).toFixed(0)}%
        </span>
      )}
    </div>
  );
};

export default TrendSparkline;
