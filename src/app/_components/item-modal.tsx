"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AnalyzedItem } from "~/server/api/routers/ge";
import { api } from "~/trpc/react";
import { SignalBadge } from "./signal-badge";

function formatGp(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M gp`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k gp`;
  return `${n} gp`;
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

interface CandlePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function CandleChart({ candles }: { candles: CandlePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      height: 200,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#78716c",
      },
      grid: {
        vertLines: { color: "#292524" },
        horzLines: { color: "#292524" },
      },
      rightPriceScale: {
        borderColor: "#292524",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#292524",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#4ade80",
      downColor: "#f87171",
      borderUpColor: "#4ade80",
      borderDownColor: "#f87171",
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
    });

    series.setData(
      candles.map((c) => ({
        time: c.timestamp as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  return <div ref={containerRef} className="w-full" />;
}

interface ItemModalProps {
  item: AnalyzedItem;
  onClose: () => void;
}

const INTERVALS = [
  { value: "5m",  label: "5m"  },
  { value: "1h",  label: "1h"  },
  { value: "6h",  label: "6h"  },
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7d"  },
  { value: "1m",  label: "1m"  },
  { value: "3m",  label: "3m"  },
  { value: "6m",  label: "6m"  },
] as const;

type Interval = (typeof INTERVALS)[number]["value"];

export function ItemModal({ item, onClose }: ItemModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState<Interval>("24h");

  const { data: candles, isLoading } = api.ge.getItemTimeseries.useQuery({
    id: item.id,
    interval,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
              {item.members ? "Members" : "F2P"} · Limit:{" "}
              {item.limit.toLocaleString()}
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
              Price History
            </p>
            <div className="flex gap-1">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => setInterval(iv.value)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    interval === iv.value
                      ? "bg-amber-700 text-white"
                      : "text-stone-400 hover:text-amber-300"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-stone-500">
              Loading chart...
            </div>
          ) : candles && candles.length > 0 ? (
            <CandleChart candles={candles} />
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
            6h Change: <PctChange value={item.priceChange6h} />
          </span>
        </div>
      </div>
    </div>
  );
}
