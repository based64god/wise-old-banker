import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const WIKI_API = "https://prices.runescape.wiki/api/v1/osrs";
const USER_AGENT = "wise-old-banker/1.0 (emmetthitz@gmail.com)";

const ANOMALY_Z = 3;
const TIMESERIES_ANOMALY_Z = 2.5;

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

function sampleStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
  return { mean, std: std || 1 };
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

    // Z-score anomaly detection across all items
    const pcStats = sampleStats(items.map((i) => i.priceChange1h));
    const mStats = sampleStats(items.map((i) => i.marginPct));
    const vrStats = sampleStats(items.map((i) => i.volumeRatio));

    for (const item of items) {
      const pcZ = Math.abs((item.priceChange1h - pcStats.mean) / pcStats.std);
      const mZ = Math.abs((item.marginPct - mStats.mean) / mStats.std);
      const vrZ = Math.abs((item.volumeRatio - vrStats.mean) / vrStats.std);

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
      const points = data.data;

      // Compute Z-scores on consecutive price changes to detect anomalous points
      const changes: number[] = [];
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]?.avgHighPrice;
        const curr = points[i]?.avgHighPrice;
        if (prev && curr && prev > 0) changes.push((curr - prev) / prev);
      }

      const { mean, std } = sampleStats(changes);

      let changeIdx = 0;
      return points.map((p, i) => {
        if (i === 0 || !points[i - 1]?.avgHighPrice || !p.avgHighPrice) {
          return { ...p, isAnomaly: false };
        }
        const change = changes[changeIdx++] ?? 0;
        const z = Math.abs((change - mean) / std);
        return { ...p, isAnomaly: z > TIMESERIES_ANOMALY_Z };
      });
    }),
});
