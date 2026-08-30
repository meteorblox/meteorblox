const suiTestnetRpc = process.env.SUI_JSON_RPC_URL ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(suiTestnetRpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sui Testnet RPC unavailable";
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status: 502 });
  }
}
