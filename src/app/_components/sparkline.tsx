"use client";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export function Sparkline({
  values,
  width = 80,
  height = 28,
  positive,
}: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trend = positive ?? values[values.length - 1]! > values[0]!;
  const color = trend ? "#4ade80" : "#f87171";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
