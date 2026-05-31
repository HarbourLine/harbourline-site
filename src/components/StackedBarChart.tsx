export interface BarSegment {
  key: string;       // stable identifier (e.g. userId) so colour stays consistent
  label: string;     // segment legend label
  value: number;
}

export interface BarColumn {
  label: string;     // x-axis label
  segments: BarSegment[];
}

interface Props {
  data: BarColumn[];
  format: "money" | "hours";
  colourFor: (key: string) => string;
  legend?: BarSegment[];      // ordered list for the legend; defaults to keys seen across data
}

const W = 600;
const H = 220;
const PAD_X = 36;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function StackedBarChart({ data, format, colourFor, legend }: Props) {
  // Find the tallest column to fix the y-scale.
  const columnTotals = data.map((c) => c.segments.reduce((s, seg) => s + Math.max(0, seg.value), 0));
  const maxTotal = Math.max(0, ...columnTotals);

  if (maxTotal <= 0) {
    return <div className="text-sm opacity-60 py-8 text-center">No data to chart yet.</div>;
  }

  const yMax = niceCeiling(maxTotal * 1.1);
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const barCount = data.length;
  const barGap = 8;
  const barWidth = (innerW - barGap * (barCount - 1)) / Math.max(barCount, 1);

  const xFor = (i: number) => PAD_X + i * (barWidth + barGap);
  const yFor = (v: number) => H - PAD_BOTTOM - (v / yMax) * innerH;

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => (yMax * i) / gridLines);

  const fmtAxis = (n: number) =>
    format === "money"
      ? `£${n >= 1000 ? `${Math.round(n / 1000)}k` : Math.round(n)}`
      : `${Math.round(n)}h`;

  // Derive legend order from the union of segment keys preserved from first
  // appearance, unless an explicit legend is provided.
  const seenKeys: string[] = [];
  const labelByKey = new Map<string, string>();
  for (const col of data) {
    for (const seg of col.segments) {
      if (!labelByKey.has(seg.key)) {
        labelByKey.set(seg.key, seg.label);
        seenKeys.push(seg.key);
      }
    }
  }
  const legendItems =
    legend ?? seenKeys.map((k) => ({ key: k, label: labelByKey.get(k) ?? k, value: 0 }));

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Stacked bar chart">
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="currentColor"
              strokeOpacity={i === 0 ? 0.25 : 0.08}
              strokeDasharray={i === 0 ? "0" : "2 3"}
            />
            <text
              x={PAD_X - 6}
              y={yFor(v) + 3}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
              opacity={0.55}
            >
              {fmtAxis(v)}
            </text>
          </g>
        ))}

        {data.map((col, i) => {
          // Sort segments largest first so the biggest contributor sits at the
          // bottom of each bar — easier to compare visually across months.
          const segs = [...col.segments].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
          let cursor = yFor(0); // start at the bottom (largest y)
          return (
            <g key={i}>
              {segs.map((seg) => {
                const height = (seg.value / yMax) * innerH;
                cursor -= height;
                return (
                  <rect
                    key={seg.key}
                    x={xFor(i)}
                    y={cursor}
                    width={barWidth}
                    height={height}
                    fill={colourFor(seg.key)}
                  >
                    <title>{`${seg.label}: ${fmtAxis(seg.value)}`}</title>
                  </rect>
                );
              })}
              <text
                x={xFor(i) + barWidth / 2}
                y={H - 8}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
                opacity={0.6}
              >
                {col.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: colourFor(item.key) }}
            />
            <span className="opacity-80">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Pleasant, distinguishable palette that reads well on both light and dark
// backgrounds. Order chosen so adjacent indices look distinct.
const PALETTE = [
  "#3b82f6", "#f97316", "#10b981", "#a855f7", "#ec4899",
  "#0ea5e9", "#eab308", "#14b8a6", "#f43f5e", "#84cc16",
  "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#d946ef",
];

// Build a stable colour assigner from a list of keys (typically seen on the
// anchor month's data). Keys not in the list get hashed into the palette as
// a fallback so legend-less rendering still works.
export function buildColourFor(orderedKeys: string[]): (key: string) => string {
  const assigned = new Map<string, string>();
  orderedKeys.forEach((k, i) => assigned.set(k, PALETTE[i % PALETTE.length]));
  return (key: string) => {
    const existing = assigned.get(key);
    if (existing) return existing;
    // Stable hash for keys that appear in historical months but not in the
    // primary ordering. Keeps the same key the same colour across renders.
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  };
}

function niceCeiling(n: number): number {
  if (n <= 0) return 0;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const ratio = n / base;
  let nice: number;
  if (ratio <= 1) nice = 1;
  else if (ratio <= 2) nice = 2;
  else if (ratio <= 2.5) nice = 2.5;
  else if (ratio <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}
