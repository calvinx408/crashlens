import React from 'react';

interface Series {
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  title: string;
  unit: string;
  series: Series[];
  // Fixed top of the y-axis (for percentages). If omitted, the chart fits the data.
  yMax?: number;
  currentText: string;
  peakText: string;
  note?: string;
}

const W = 600;
const H = 160;
const PAD_L = 44;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;

const LineChart: React.FC<LineChartProps> = ({ title, unit, series, yMax, currentText, peakText, note }) => {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const top = yMax ?? niceCeil(Math.max(dataMax, 1));

  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number) => PAD_T + (1 - Math.min(v, top) / top) * (H - PAD_T - PAD_B);

  const ticks = [0, 0.5, 1].map((f) => ({ v: top * f, py: y(top * f) }));

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h4>{title}</h4>
        <div className="chart-values">
          <span className="chart-current">{currentText}</span>
          <span className="muted small">peak {peakText}</span>
        </div>
      </div>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} /> {s.label}</span>
          ))}
        </div>
      )}
      {n < 2 ? (
        <div className="chart-empty">Collecting data…</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over time`} className="chart-svg">
          {ticks.map((t) => (
            <g key={t.py}>
              <line x1={PAD_L} x2={W - PAD_R} y1={t.py} y2={t.py} className="grid-line" />
              <text x={PAD_L - 6} y={t.py + 4} textAnchor="end" className="axis-text">
                {formatTick(t.v)}{unit}
              </text>
            </g>
          ))}
          {series.map((s) => {
            const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
            return <polyline key={s.label} points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />;
          })}
        </svg>
      )}
      {note && <p className="muted small chart-note">{note}</p>}
    </div>
  );
};

function niceCeil(v: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (const s of steps) if (v <= s) return s;
  return Math.ceil(v / 1000) * 1000;
}

function formatTick(v: number): string {
  return v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
}

export default LineChart;
