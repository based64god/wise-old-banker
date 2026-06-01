import { api, HydrateClient } from "~/trpc/server";
import { MarketDashboard } from "~/app/_components/market-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  void api.ge.getMarketOverview.prefetch();

  return (
    <HydrateClient>
      <MarketDashboard />
    </HydrateClient>
  );
}
