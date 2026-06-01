"use client";

import { useState } from "react";
import type { AnalyzedItem, Signal } from "~/server/api/routers/ge";
import { api } from "~/trpc/react";
import { ItemModal } from "./item-modal";
import { MarketTable } from "./market-table";
import { SignalBadge } from "./signal-badge";

type Tab = "all" | Signal;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Items" },
  { id: "SURGING", label: "Surging" },
  { id: "CRASHING", label: "Crashing" },
  { id: "HIGH_MARGIN", label: "High Margin" },
  { id: "VOLUME_SPIKE", label: "Volume Spikes" },
];

function formatGp(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M gp`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k gp`;
  return `${n} gp`;
}

function TopCard({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: AnalyzedItem[];
  onSelect: (item: AnalyzedItem) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-900/40 bg-stone-900/50">
      <div className="border-b border-amber-900/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-amber-400">{title}</h3>
      </div>
      <ul>
        {items.slice(0, 5).map((item) => (
          <li
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex cursor-pointer items-center justify-between border-b border-stone-800/50 px-4 py-2 text-sm last:border-0 hover:bg-amber-900/10"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://oldschool.runescape.wiki/images/${encodeURIComponent(item.icon.replace(/ /g, "_"))}`}
                alt=""
                className="h-5 w-5 shrink-0 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="truncate text-amber-200">{item.name}</span>
            </div>
            <div className="ml-2 shrink-0 text-right">
              <p className="text-xs text-stone-400">
                {formatGp(item.currentPrice)}
              </p>
              <p
                className={`text-xs font-medium ${
                  item.priceChange1h >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {item.priceChange1h >= 0 ? "+" : ""}
                {(item.priceChange1h * 100).toFixed(1)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<AnalyzedItem | null>(null);

  const { data, isLoading, error, refetch, isFetching } =
    api.ge.getMarketOverview.useQuery(undefined, {
      refetchInterval: 90_000,
      staleTime: 60_000,
    });

  const items = data?.items ?? [];

  const tabItems =
    activeTab === "all" ? items : items.filter((i) => i.signal === activeTab);

  const surging = items.filter((i) => i.signal === "SURGING");
  const crashing = items.filter((i) => i.signal === "CRASHING");
  const highMargin = items
    .filter((i) => i.signal === "HIGH_MARGIN")
    .sort((a, b) => b.marginPct - a.marginPct);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <div className="rounded-xl border border-red-800 bg-stone-900 p-8 text-center">
          <p className="text-red-400">Failed to load Grand Exchange data.</p>
          <p className="mt-1 text-sm text-stone-500">{error.message}</p>
          <button
            onClick={() => void refetch()}
            className="mt-4 rounded-lg bg-amber-700 px-4 py-2 text-sm text-white hover:bg-amber-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0800] text-stone-100">
      {/* Header */}
      <header className="border-b border-amber-900/50 bg-[#150e00]/90 backdrop-blur-sm shadow-[0_2px_20px_rgba(180,100,0,0.1)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-amber-400">
              Wise Old Banker
            </h1>
            <p className="text-xs text-stone-400">
              Grand Exchange Market Analysis · OSRS
            </p>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <p className="text-xs text-stone-500">
                {items.length.toLocaleString()} items ·{" "}
                {data.fetchedAt.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-lg border border-amber-800/60 bg-stone-800 px-3 py-1.5 text-xs text-amber-300 hover:bg-stone-700 disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-stone-700 border-t-amber-500" />
            <p className="text-stone-400">
              Loading Grand Exchange data…
            </p>
          </div>
        ) : (
          <>
            {/* Signal summary cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <TopCard
                title="Surging Items"
                items={surging}
                onSelect={setSelectedItem}
              />
              <TopCard
                title="Crashing Items"
                items={crashing}
                onSelect={setSelectedItem}
              />
              <TopCard
                title="High Margin Flips"
                items={highMargin}
                onSelect={setSelectedItem}
              />
            </div>

            {/* Search and tabs */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-amber-700 text-white"
                        : "border border-stone-700 text-stone-400 hover:border-amber-800 hover:text-amber-300"
                    }`}
                  >
                    {tab.label}
                    {tab.id !== "all" && (
                      <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px]">
                        {tab.id === "SURGING"
                          ? surging.length
                          : tab.id === "CRASHING"
                            ? crashing.length
                            : tab.id === "HIGH_MARGIN"
                              ? highMargin.length
                              : items.filter((i) => i.signal === tab.id).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-100 placeholder-stone-500 outline-none focus:border-amber-700 sm:w-64"
              />
            </div>

            {/* Signal legend */}
            <div className="mb-4 flex flex-wrap gap-3 text-xs text-stone-400">
              <span className="font-semibold">Signals:</span>
              <span>
                <SignalBadge signal="SURGING" /> price up &gt;4% vs 6h avg,
                volume rising
              </span>
              <span>
                <SignalBadge signal="CRASHING" /> price down &gt;4% vs 6h avg
              </span>
              <span>
                <SignalBadge signal="HIGH_MARGIN" /> buy/sell spread &gt;6%
              </span>
              <span>
                <SignalBadge signal="VOLUME_SPIKE" /> 1h volume &gt;2.5× baseline
              </span>
            </div>

            <MarketTable
              items={tabItems}
              onSelect={setSelectedItem}
              filter={search}
            />

            <p className="mt-3 text-xs text-stone-600">
              Data from the{" "}
              <a
                href="https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-500 hover:text-amber-600"
              >
                OSRS Wiki Real-time Prices API
              </a>
              . Auto-refreshes every 90s. Signals are for informational purposes
              only.
            </p>
          </>
        )}
      </main>

      {selectedItem && (
        <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
