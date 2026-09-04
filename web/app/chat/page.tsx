import type { Metadata } from "next";
import { ChatRoom } from "./room";

export const metadata: Metadata = {
  title: "Community Chat | SLVRBLOX",
  description: "Wallet-verified community chat for SLVRBLOX Testnet miners.",
};

export default function ChatPage() {
  return <ChatRoom />;
}
