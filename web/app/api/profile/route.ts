import { fromBase64 } from "@mysten/bcs";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { getProfiles, saveProfile } from "../../../db/profiles";

const addressPattern = /^0x[a-f0-9]{64}$/;
const usernamePattern = /^[A-Za-z0-9_-]{3,20}$/;
const suiClient = new SuiJsonRpcClient({
  network: "testnet",
  url: getJsonRpcFullnodeUrl("testnet"),
});

export function profileMessage(address: string, username: string) {
  return `SLVRBLOX profile\nWallet: ${address.toLowerCase()}\nUsername: ${username}`;
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.toLowerCase() ?? "";
  if (!addressPattern.test(address)) return Response.json({ error: "Valid Sui wallet address required" }, { status: 400 });
  const profiles = await getProfiles([address]);
  return Response.json({ address, username: profiles.get(address) ?? "" }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { address?: string; username?: string; bytes?: string; signature?: string };
    const address = body.address?.toLowerCase() ?? "";
    const username = body.username?.trim() ?? "";
    if (!addressPattern.test(address) || !usernamePattern.test(username) || !body.bytes || !body.signature) {
      return Response.json({ error: "Valid wallet, username, and signature required" }, { status: 400 });
    }
    const expected = new TextEncoder().encode(profileMessage(address, username));
    const signed = fromBase64(body.bytes);
    if (signed.length !== expected.length || !signed.every((value, index) => value === expected[index])) {
      return Response.json({ error: "Signed profile message does not match" }, { status: 400 });
    }
    await verifyPersonalMessageSignature(signed, body.signature, { address, client: suiClient });
    await saveProfile(address, username);
    return Response.json({ address, username });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE/i.test(error.message)
      ? "That username is already taken"
      : "Unable to verify and save username";
    return Response.json({ error: message }, { status: 400 });
  }
}
