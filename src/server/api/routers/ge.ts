import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const WIKI_API = "https://prices.runescape.wiki/api/v1/osrs";
const USER_AGENT = "wise-old-banker/1.0 (emmetthitz@gmail.com)";

// Modified Z-score threshold (Iglewicz & Hoaglin recommend 3.5 for MAD-based detection)
const ANOMALY_Z = 3.5;

interface MappingItem {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  lowalch: number | null;
  highalch: number | null;
  limit: number | null;
  value: number;
  icon: string;
}

interface LatestPrice {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
}

interface TimestepPrice {
  avgHighPrice: number | null;
  highPriceVolume: number;
  avgLowPrice: number | null;
  lowPriceVolume: number;
}

interface TimeseriesPoint {
  timestamp: number;
  avgHighPrice: number | null;
  avgLowPrice: number | null;
  highPriceVolume: number;
  lowPriceVolume: number;
}

export type Signal =
  | "SURGING"
  | "CRASHING"
  | "HIGH_MARGIN"
  | "VOLUME_SPIKE"
  | "STABLE";

export interface AnalyzedItem {
  id: number;
  name: string;
  icon: string;
  members: boolean;
  currentPrice: number;
  highPrice: number;
  lowPrice: number;
  priceChange1h: number;
  priceChange6h: number;
  marginPct: number;
  volume1h: number;
  volumeRatio: number;
  momentumScore: number;
  signal: Signal;
  limit: number;
  highalch: number;
  isAnomaly: boolean;
}

async function wikiGet<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${WIKI_API}${path}`, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`OSRS Wiki API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// MAD-based robust stats. Unlike mean/std, the median and MAD are not pulled
// by extreme values, so a single spike can't inflate the spread enough to mask itself.
// Returns raw MAD (may be 0 when all values are identical).
function robustStats(values: number[]): { median: number; mad: number } {
  if (values.length === 0) return { median: 0, mad: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  const deviations = sorted
    .map((v) => Math.abs(v - med))
    .sort((a, b) => a - b);
  const madMid = Math.floor(deviations.length / 2);
  const mad =
    deviations.length % 2 === 0
      ? ((deviations[madMid - 1] ?? 0) + (deviations[madMid] ?? 0)) / 2
      : (deviations[madMid] ?? 0);
  return { median: med, mad };
}

// Modified Z-score: 0.6745 normalises MAD to be comparable to std dev for
// normally-distributed data (Iglewicz & Hoaglin 1993).
// Returns 0 when MAD is 0 (all values identical — no deviation is possible).
function modifiedZ(value: number, med: number, mad: number): number {
  if (mad === 0) return 0;
  return (0.6745 * Math.abs(value - med)) / mad;
}

function classifySignal(
  priceChange1h: number,
  marginPct: number,
  volumeRatio: number,
  volume1h: number,
): Signal {
  if (priceChange1h > 0.03 && (volumeRatio >= 0.8 || volume1h > 500))
    return "SURGING";
  if (priceChange1h < -0.03) return "CRASHING";
  if (marginPct > 0.05) return "HIGH_MARGIN";
  if (volumeRatio > 2.5 && volume1h > 200) return "VOLUME_SPIKE";
  return "STABLE";
}

function analyzeItem(
  id: number,
  mappingItem: MappingItem,
  latest: LatestPrice,
  oneHour: TimestepPrice | undefined,
  sixHour: TimestepPrice | undefined,
  twentyFourHour: TimestepPrice | undefined,
): AnalyzedItem | null {
  const h1High = oneHour?.avgHighPrice;
  const h6High = sixHour?.avgHighPrice;
  const h24High = twentyFourHour?.avgHighPrice;

  const basePrice = h1High ?? latest.high ?? latest.low ?? null;
  if (!basePrice) return null;

  const highPrice = latest.high ?? h1High ?? basePrice;
  const lowPrice = latest.low ?? oneHour?.avgLowPrice ?? 0;
  const currentPrice = h1High ?? basePrice;

  const effectiveHigh = h1High ?? latest.high;
  const effectiveLow = oneHour?.avgLowPrice ?? latest.low;

  const priceChange1h =
    effectiveHigh && h6High ? (effectiveHigh - h6High) / h6High : 0;
  const priceChange6h =
    h6High && h24High ? (h6High - h24High) / h24High : priceChange1h;

  const marginPct =
    effectiveHigh && effectiveLow && effectiveLow > 0
      ? (effectiveHigh - effectiveLow) / effectiveLow
      : 0;

  const volume1h = oneHour
    ? oneHour.highPriceVolume + oneHour.lowPriceVolume
    : 0;
  const volume6h = sixHour
    ? sixHour.highPriceVolume + sixHour.lowPriceVolume
    : 0;
  const volumeRate6h = volume6h / 6;
  const volumeRatio = volumeRate6h > 0 ? volume1h / volumeRate6h : 1;

  const momentumScore = clamp(
    priceChange1h * 0.65 + priceChange6h * 0.35,
    -1,
    1,
  );

  return {
    id,
    name: mappingItem.name,
    icon: mappingItem.icon,
    members: mappingItem.members,
    currentPrice,
    highPrice,
    lowPrice,
    priceChange1h,
    priceChange6h,
    marginPct,
    volume1h,
    volumeRatio,
    momentumScore,
    signal: classifySignal(priceChange1h, marginPct, volumeRatio, volume1h),
    limit: mappingItem.limit ?? 0,
    highalch: mappingItem.highalch ?? 0,
    isAnomaly: false,
  };
}

export const geRouter = createTRPCRouter({
  getMarketOverview: publicProcedure.query(async () => {
    const [mappingRaw, latestRaw, oneHourRaw, sixHourRaw, twentyFourHourRaw] =
      await Promise.all([
        wikiGet<MappingItem[]>("/mapping", 3600),
        wikiGet<{ data: Record<string, LatestPrice> }>("/latest", 60),
        wikiGet<{ data: Record<string, TimestepPrice> }>("/1h", 300),
        wikiGet<{ data: Record<string, TimestepPrice> }>("/6h", 1800),
        wikiGet<{ data: Record<string, TimestepPrice> }>("/24h", 3600),
      ]);

    const mapping = new Map(mappingRaw.map((item) => [item.id, item]));

    const items: AnalyzedItem[] = [];

    for (const [idStr, latestPrice] of Object.entries(latestRaw.data)) {
      const id = parseInt(idStr, 10);
      const mappingItem = mapping.get(id);
      if (!mappingItem) continue;

      const analyzed = analyzeItem(
        id,
        mappingItem,
        latestPrice,
        oneHourRaw.data[idStr],
        sixHourRaw.data[idStr],
        twentyFourHourRaw.data[idStr],
      );
      if (!analyzed) continue;
      if (Math.abs(analyzed.priceChange1h) > 0.8) continue;

      items.push(analyzed);
    }

    // Robust anomaly detection across all items using MAD-based modified Z-score.
    // Prevents extreme outliers from inflating the spread and masking themselves.
    // MAD floors prevent near-zero denominators when many items share a default value (0 or 1).
    const pcStats = robustStats(items.map((i) => i.priceChange1h));
    const mStats = robustStats(items.map((i) => i.marginPct));
    const vrStats = robustStats(items.map((i) => i.volumeRatio));
    const pcMad = Math.max(pcStats.mad, 0.01);   // floor at 1% price-change unit
    const mMad = Math.max(mStats.mad, 0.01);     // floor at 1% margin unit
    const vrMad = Math.max(vrStats.mad, 0.1);    // floor at 0.1× volume-ratio unit

    for (const item of items) {
      const pcZ = modifiedZ(item.priceChange1h, pcStats.median, pcMad);
      const mZ = modifiedZ(item.marginPct, mStats.median, mMad);
      const vrZ = modifiedZ(item.volumeRatio, vrStats.median, vrMad);

      if (pcZ > ANOMALY_Z || mZ > ANOMALY_Z || vrZ > ANOMALY_Z) {
        item.isAnomaly = true;
        // Zero out the anomalous dimensions so they don't drive signal classification
        if (pcZ > ANOMALY_Z) item.priceChange1h = 0;
        if (mZ > ANOMALY_Z) item.marginPct = 0;
        if (vrZ > ANOMALY_Z) item.volumeRatio = 1;
        item.signal = classifySignal(
          item.priceChange1h,
          item.marginPct,
          item.volumeRatio,
          item.volume1h,
        );
      }
    }

    items.sort(
      (a, b) => Math.abs(b.momentumScore) - Math.abs(a.momentumScore),
    );

    return { items, fetchedAt: new Date() };
  }),

  getItemTimeseries: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        timestep: z.enum(["5m", "1h", "6h"]).default("5m"),
      }),
    )
    .query(async ({ input }) => {
      const data = await wikiGet<{ data: TimeseriesPoint[] }>(
        `/timeseries?timestep=${input.timestep}&id=${input.id}`,
        120,
      );

      // Discard candles backed by fewer than this many transactions — single-trade
      // candles skew the average price and are the main source of chart noise.
      const MIN_CANDLE_VOLUME = 2;

      const candles: {
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }[] = [];

      for (const p of data.data) {
        const volume = p.highPriceVolume + p.lowPriceVolume;
        if (!p.avgHighPrice || !p.avgLowPrice || volume < MIN_CANDLE_VOLUME) continue;

        // open tracks from the previous candle's close so the body shows direction
        const open = candles[candles.length - 1]?.close ?? p.avgHighPrice;

        candles.push({
          timestamp: p.timestamp,
          open,
          high: p.avgHighPrice,
          low: p.avgLowPrice,
          close: p.avgHighPrice,
          volume,
        });
      }

      return candles;
    }),
});
