import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const WIKI_API = "https://prices.runescape.wiki/api/v1/osrs";
const USER_AGENT = "wise-old-banker/1.0 (emmetthitz@gmail.com)";

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

  // Need at least one price reference to display anything
  const basePrice = h1High ?? latest.high ?? latest.low ?? null;
  if (!basePrice) return null;

  const highPrice = latest.high ?? h1High ?? basePrice;
  const lowPrice = latest.low ?? oneHour?.avgLowPrice ?? 0;
  const currentPrice = h1High ?? basePrice;

  const priceChange1h =
    effectiveHigh && h6High ? (effectiveHigh - h6High) / h6High : 0;
  const priceChange6h =
    h6High && h24High ? (h6High - h24High) / h24High : priceChange1h;

  const h1Low = oneHour?.avgLowPrice;
  const effectiveLow = h1Low ?? latest.low;
  const effectiveHigh = h1High ?? latest.high;
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

  let signal: Signal = "STABLE";
  if (priceChange1h > 0.03 && (volumeRatio >= 0.8 || volume1h > 500)) {
    signal = "SURGING";
  } else if (priceChange1h < -0.03) {
    signal = "CRASHING";
  } else if (marginPct > 0.05) {
    signal = "HIGH_MARGIN";
  } else if (volumeRatio > 2.5 && volume1h > 200) {
    signal = "VOLUME_SPIKE";
  }

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
    signal,
    limit: mappingItem.limit ?? 0,
    highalch: mappingItem.highalch ?? 0,
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

      const oneHour = oneHourRaw.data[idStr];
      const sixHour = sixHourRaw.data[idStr];
      const twentyFourHour = twentyFourHourRaw.data[idStr];

      const analyzed = analyzeItem(
        id,
        mappingItem,
        latestPrice,
        oneHour,
        sixHour,
        twentyFourHour,
      );
      if (!analyzed) continue;

      // Filter: cap anomalous price deviations (single-trade spikes)
      if (Math.abs(analyzed.priceChange1h) > 0.8) continue;

      items.push(analyzed);
    }

    items.sort(
      (a, b) => Math.abs(b.momentumScore) - Math.abs(a.momentumScore),
    );

    return {
      items,
      fetchedAt: new Date(),
    };
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
      return data.data;
    }),
});
