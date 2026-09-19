import { fromBase64 } from "@mysten/bcs";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { activateNode, readChecks, readNode, sentinelDb } from "../../../db/sentinel.ts";
import { activationMessage, validActivation, WALLET_PATTERN } from "../../sentinel/model.ts";

const headers = { "cache-control": "no-store" };
const enabled = () => process.env.SENTINEL_ENABLED === "true";
const paused = () => process.env.SENTINEL_ACTIVATION_PAUSED === "true";
const client = new SuiGraphQLClient({ network: "testnet", url: "https://graphql.testnet.sui.io/graphql" });

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (address && !WALLET_PATTERN.test(address)) return Response.json({ error: "Invalid wallet address" }, { status: 400, headers });
  if (!enabled()) return Response.json({ enabled: false, activationPaused: true, node: null, checks: [] }, { headers });
  try {
    const db = await sentinelDb();
    const [node, checks] = await Promise.all([address ? readNode(db, address) : null, readChecks(db)]);
    return Response.json({ enabled: true, activationPaused: paused(), node, checks }, { headers });
  } catch {
    return Response.json({ error: "Node storage is temporarily unavailable. Please try again later." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!enabled() || paused()) return Response.json({ error: "Test node activation is currently paused." }, { status: 503, headers });
  let address: string;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) throw new Error("Invalid approval");
    const body = JSON.parse(raw);
    if (!validActivation(body.address, body.timestamp) || typeof body.bytes !== "string" || typeof body.signature !== "string") throw new Error("Invalid approval");
    address = body.address;
    const expected = new TextEncoder().encode(activationMessage(address, body.timestamp));
    const signed = fromBase64(body.bytes);
    if (signed.length !== expected.length || !signed.every((byte, i) => byte === expected[i])) throw new Error("Invalid approval");
    await verifyPersonalMessageSignature(signed, body.signature, { address, client });
  } catch {
    return Response.json({ error: "Unable to verify activation. Please sign a fresh approval with this wallet." }, { status: 400, headers });
  }
  try {
    const node = await activateNode(await sentinelDb(), address);
    return Response.json({ node }, { headers });
  } catch {
    return Response.json({ error: "Activation could not be saved. Please try again later." }, { status: 503, headers });
  }
}
