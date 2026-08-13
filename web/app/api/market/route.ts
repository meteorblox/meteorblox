export async function GET() {
  let suiUsd: number | null = null;
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/SUI-USD/spot", {
      headers: { accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(3500),
    });
    if (response.ok) {
      const data = await response.json() as { data?: { amount?: string } };
      const price = Number(data.data?.amount);
      if (Number.isFinite(price) && price > 0) suiUsd = price;
    }
  } catch { /* fall through to the secondary feed */ }
  if (suiUsd === null) try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd", {
      headers: { accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(3500),
    });
    if (response.ok) {
      const data = await response.json() as { sui?: { usd?: number } };
      if (typeof data.sui?.usd === "number" && data.sui.usd > 0) suiUsd = data.sui.usd;
    }
  } catch { /* the UI keeps a neutral unavailable state */ }
  return Response.json({ suiUsd }, { headers: { "cache-control": suiUsd === null ? "no-store" : "public, max-age=60" } });
}
