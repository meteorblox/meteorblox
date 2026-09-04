import { fromBase64 } from "@mysten/bcs";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { getChatMessages, saveChatMessage } from "../../../db/chat";

const addressPattern = /^0x[a-f0-9]{64}$/;
const maxMessageLength = 500;
const suiClient = new SuiGraphQLClient({
  network: "testnet",
  url: "https://graphql.testnet.sui.io/graphql",
});

export function chatMessage(address: string, message: string, timestamp: number) {
  return `SLVRBLOX community chat\nWallet: ${address}\nTimestamp: ${timestamp}\nMessage: ${message}`;
}

export async function GET() {
  try {
    return Response.json({ messages: await getChatMessages() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Community chat is temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { address?: string; message?: string; timestamp?: number; bytes?: string; signature?: string };
    const address = body.address?.toLowerCase() ?? "";
    const message = body.message?.trim() ?? "";
    const timestamp = Number(body.timestamp);
    if (!addressPattern.test(address) || !message || message.length > maxMessageLength || !Number.isSafeInteger(timestamp) || !body.bytes || !body.signature) {
      return Response.json({ error: "Valid wallet signature and a message of 1–500 characters required" }, { status: 400 });
    }
    if (Math.abs(Date.now() - timestamp) > 5 * 60_000) {
      return Response.json({ error: "Message approval expired. Please try again" }, { status: 400 });
    }
    const expected = new TextEncoder().encode(chatMessage(address, message, timestamp));
    const signed = fromBase64(body.bytes);
    if (signed.length !== expected.length || !signed.every((value, index) => value === expected[index])) {
      return Response.json({ error: "Signed chat message does not match" }, { status: 400 });
    }
    await verifyPersonalMessageSignature(signed, body.signature, { address, client: suiClient });
    await saveChatMessage(address, message, body.signature, timestamp);
    return Response.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unable to post message";
    console.error("[chat] POST failed", error);
    const safeMessage = /wait 10 seconds|Hourly message limit/i.test(detail)
      ? detail
      : /UNIQUE constraint failed: chat_messages\.signature/i.test(detail)
        ? "This signed message was already submitted. Refresh the chat."
        : "Unable to verify and post message";
    return Response.json({ error: safeMessage }, { status: 400 });
  }
}
