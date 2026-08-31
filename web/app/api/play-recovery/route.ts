import { SuiGraphQLClient } from "@mysten/sui/graphql";

const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const client = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address")?.toLowerCase();
    const since = Number(url.searchParams.get("since") ?? 0);
    if (!address || !Number.isFinite(since)) return Response.json({ error: "Invalid recovery query" }, { status: 400 });

    const result = await client.core.listTransactions({
      filter: { sender: address },
      order: "descending",
      limit: 10,
      include: { effects: true },
    });
    const match = result.transactions.find((item) => {
      if (item.$kind !== "Transaction") return false;
      const transaction = item.Transaction;
      return (transaction.timestampMs ?? 0) >= since - 2_000 &&
        transaction.effects?.changedObjects.some((object) => object.objectId.toLowerCase() === gameId);
    });

    return Response.json({ digest: match?.Transaction.digest ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify the approved Testnet play";
    return Response.json({ error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
