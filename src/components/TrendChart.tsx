interface Point {
  label: string;
  value: number | null;
}

interface Props {
  data: Point[];
  // Two visual variants: money axis (£) or rate axis (£/hr).
  format: "money" | "rate";
}

const W = 600;
const H = 200;
const PAD_X = 36;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function TrendChart({ data, format }: Props) {
  const numericValues = data.map((p) => p.value).filter((v): v is number => v != null);
  if (numericValues.length === 0) {
    return <div className="text-sm opacity-60 py-8 text-center">No data to chart yet.</div>;
  }

  const maxValue = Math.max(...numericValues);
  const minValue = Math.min(...numericValues, 0);
  // Round up to a "nice" axis maximum so the line doesn't kiss the top.
  const yMax = niceCeiling(maxValue * 1.1);
  const yMin = minValue < 0 ? niceCeiling(-minValue * 1.1) * -1 : 0;
  const yRange = yMax - yMin || 1;

  const xStep = data.length > 1 ? (W - PAD_X * 2) / (data.length - 1) : 0;
  const xFor = (i: number) => PAD_X + i * xStep;
  const yFor = (v: number) => H - PAD_BOTTOM - ((v - yMin) / yRange) * (H - PAD_TOP - PAD_BOTTOM);

  // Path string; skip null points by breaking the path with M.
  let path = "";
  let pendingMove = true;
  data.forEach((p, i) => {
    if (p.value == null) {
      pendingMove = true;
      return;
    }
    const cmd = pendingMove ? "M" : "L";
    path += `${cmd}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)} `;
    pendingMove = false;
  });

  const fmtAxis = (n: number) =>
    format === "money"
      ? `£${n >= 1000 ? `${Math.round(n / 1000)}k` : Math.round(n)}`
      : `£${Math.round(n)}`;

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => yMin + (yRange * i) / gridLines);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`6-month ${format === "money" ? "billed £" : "effective £/hr"} trend`}
    >
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

      <path d={path.trim()} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />

      {data.map((p, i) =>
        p.value == null ? null : (
          <circle
            key={i}
            cx={xFor(i)}
            cy={yFor(p.value)}
            r={3}
            fill="currentColor"
          />
        ),
      )}

      {data.map((p, i) => (
        <text
          key={`x-${i}`}
          x={xFor(i)}
          y={H - 8}
          fontSize="10"
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// Round up to a "nice" number so the axis maximum isn't 18,247 but 20,000.
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
