"use client";

import { useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyzedItem } from "~/server/api/routers/ge";

interface AnomalyDotProps {
  cx?: number;
  cy?: number;
  payload: { isAnomaly: boolean };
}
import { api } from "~/trpc/react";
import { SignalBadge } from "./signal-badge";

function formatGp(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M gp`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k gp`;
  return `${n} gp`;
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PctChange({ value }: { value: number }) {
  if (!isFinite(value)) return <span className="text-stone-500">—</span>;
  const pct = (value * 100).toFixed(2);
  const pos = value >= 0;
  return (
    <span className={pos ? "text-green-400" : "text-red-400"}>
      {pos ? "+" : ""}
      {pct}%
    </span>
  );
}

interface ItemModalProps {
  item: AnalyzedItem;
  onClose: () => void;
}

export function ItemModal({ item, onClose }: ItemModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: timeseries, isLoading } = api.ge.getItemTimeseries.useQuery({
    id: item.id,
    timestep: "5m",
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const chartData = timeseries?.map((p) => ({
    time: formatTs(p.timestamp),
    high: p.avgHighPrice,
    low: p.avgLowPrice,
    vol: (p.highPriceVolume ?? 0) + (p.lowPriceVolume ?? 0),
    isAnomaly: p.isAnomaly ?? false,
  }));

  const iconUrl = `https://oldschool.runescape.wiki/images/${encodeURIComponent(item.icon.replace(/ /g, "_"))}`;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="w-full max-w-2xl rounded-xl border border-amber-900/60 bg-stone-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-amber-900/40 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconUrl}
            alt={item.name}
            className="h-8 w-8 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-amber-300">{item.name}</h2>
            <p className="text-xs text-stone-400">
              {item.members ? "Members" : "F2P"} · Limit: {item.limit.toLocaleString()}
            </p>
          </div>
          <SignalBadge signal={item.signal} />
          <button
            onClick={onClose}
            className="ml-2 rounded p-1 text-stone-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-px border-b border-amber-900/30 bg-amber-900/20">
          {[
            { label: "Buy Price", value: formatGp(item.highPrice) },
            { label: "Sell Price", value: formatGp(item.lowPrice) },
            {
              label: "1h Change",
              value: <PctChange value={item.priceChange1h} />,
            },
            {
              label: "Margin",
              value: (
                <span className="text-amber-400">
                  {isFinite(item.marginPct)
                    ? `${(item.marginPct * 100).toFixed(1)}%`
                    : "—"}
                </span>
              ),
            },
          ].map(({ label, value }) => (
            <div key={label} className="bg-stone-950 px-4 py-3">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="font-semibold text-stone-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-stone-400 uppercase">
              Price History (last 24h · 5min intervals)
            </p>
            <span className="flex items-center gap-1 text-xs text-stone-500">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
              anomalous point
            </span>
          </div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-stone-500">
              Loading chart...
            </div>
          ) : chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#78716c", fontSize: 10 }}
                  interval={Math.floor(chartData.length / 6)}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#78716c", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1c1917",
                    border: "1px solid #44403c",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#a8a29e" }}
                  formatter={(value, name) => [
                    formatGp(Number(value)),
                    name === "high" ? "Buy" : "Sell",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="high"
                  stroke="#4ade80"
                  strokeWidth={1.5}
                  fill="url(#highGrad)"
                  dot={(props: AnomalyDotProps) => {
                    if (!props.payload.isAnomaly || props.cx == null || props.cy == null)
                      return <g key={props.cx} />;
                    return (
                      <circle
                        key={props.cx}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill="#f97316"
                        stroke="#1c1917"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="low"
                  stroke="#f87171"
                  strokeWidth={1.5}
                  fill="url(#lowGrad)"
                  dot={(props: AnomalyDotProps) => {
                    if (!props.payload.isAnomaly || props.cx == null || props.cy == null)
                      return <g key={props.cx} />;
                    return (
                      <circle
                        key={props.cx}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill="#f97316"
                        stroke="#1c1917"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-stone-500">
              No chart data available
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="flex gap-6 border-t border-amber-900/30 px-5 py-3 text-xs text-stone-400">
          <span>
            Volume (1h):{" "}
            <span className="text-stone-200">
              {item.volume1h.toLocaleString()}
            </span>
          </span>
          <span>
            Vol. Ratio:{" "}
            <span
              className={
                item.volumeRatio > 1 ? "text-green-400" : "text-red-400"
              }
            >
              {item.volumeRatio.toFixed(2)}×
            </span>
          </span>
          <span>
            High Alch:{" "}
            <span className="text-stone-200">{formatGp(item.highalch)}</span>
          </span>
          <span>
            6h Change:{" "}
            <PctChange value={item.priceChange6h} />
          </span>
        </div>
      </div>
    </div>
  );
}
