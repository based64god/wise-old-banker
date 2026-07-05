"use client";

import { useState } from "react";
import type { AnalyzedItem } from "~/server/api/routers/ge";
import { SignalBadge } from "./signal-badge";

type SortKey = keyof Pick<
  AnalyzedItem,
  | "name"
  | "currentPrice"
  | "priceChange1h"
  | "priceChange6h"
  | "marginPct"
  | "volume1h"
  | "volumeRatio"
  | "momentumScore"
>;

function formatGp(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function PctCell({ value }: { value: number }) {
  const pct = (value * 100).toFixed(2);
  const pos = value >= 0;
  return (
    <span className={pos ? "text-green-400" : "text-red-400"}>
      {pos ? "▲" : "▼"} {Math.abs(Number(pct))}%
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold tracking-wide text-stone-400 uppercase hover:text-amber-300"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1 text-amber-400">
          {direction === "desc" ? "↓" : "↑"}
        </span>
      )}
    </th>
  );
}

interface MarketTableProps {
  items: AnalyzedItem[];
  onSelect: (item: AnalyzedItem) => void;
  filter?: string;
  minVolume?: number;
}

export function MarketTable({
  items,
  onSelect,
  filter,
  minVolume = 0,
}: MarketTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("momentumScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [absPctSort, setAbsPctSort] = useState(false);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = items.filter(
    (i) =>
      i.volume1h >= minVolume &&
      (!filter || i.name.toLowerCase().includes(filter.toLowerCase())),
  );

  const isPctKey = sortKey === "priceChange1h" || sortKey === "priceChange6h";

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc"
        ? av.localeCompare(bv)
        : bv.localeCompare(av);
    }
    if (absPctSort && isPctKey) {
      av = Math.abs(av as number);
      bv = Math.abs(bv as number);
    }
    return sortDir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  const cols: { label: string; key: SortKey }[] = [
    { label: "Item", key: "name" },
    { label: "Price", key: "currentPrice" },
    { label: "1h %", key: "priceChange1h" },
    { label: "6h %", key: "priceChange6h" },
    { label: "Margin", key: "marginPct" },
    { label: "Vol (1h)", key: "volume1h" },
    { label: "Vol Ratio", key: "volumeRatio" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-amber-900/40">
      <div className="flex justify-end border-b border-amber-900/40 bg-stone-900/80 px-3 py-1.5">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-400 select-none hover:text-amber-300">
          <input
            type="checkbox"
            checked={absPctSort}
            onChange={(e) => setAbsPctSort(e.target.checked)}
            className="accent-amber-500"
          />
          Sort % change by absolute value
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-amber-900/40 bg-stone-900/80">
          <tr>
            {cols.map((c) => (
              <SortHeader
                key={c.key}
                label={c.label}
                sortKey={c.key}
                current={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
            ))}
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-stone-400 uppercase">
              Signal
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 100).map((item, i) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              className={`cursor-pointer border-b border-stone-800/50 transition-colors hover:bg-amber-900/10 ${
                i % 2 === 0 ? "bg-stone-950" : "bg-stone-900/30"
              }`}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://oldschool.runescape.wiki/images/${encodeURIComponent(item.icon.replace(/ /g, "_"))}`}
                    alt=""
                    className="h-5 w-5 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="max-w-[180px] truncate font-medium text-amber-200">
                    {item.name}
                  </span>
                  {item.members && (
                    <span className="hidden rounded bg-stone-800 px-1 text-[10px] text-stone-500 sm:inline">
                      M
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-stone-100">
                {formatGp(item.currentPrice)}
              </td>
              <td className="px-3 py-2">
                <PctCell value={item.priceChange1h} />
              </td>
              <td className="px-3 py-2">
                <PctCell value={item.priceChange6h} />
              </td>
              <td className="px-3 py-2 text-amber-400">
                {(item.marginPct * 100).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-stone-300">
                {item.volume1h.toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span
                  className={
                    item.volumeRatio > 1 ? "text-green-400" : "text-stone-400"
                  }
                >
                  {item.volumeRatio.toFixed(2)}×
                </span>
              </td>
              <td className="px-3 py-2">
                <SignalBadge signal={item.signal} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="py-12 text-center text-stone-500">
          No items match your filters.
        </div>
      )}
    </div>
  );
}
