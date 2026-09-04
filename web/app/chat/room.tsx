"use client";

import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Message = { id: number; address: string; username: string; message: string; createdAt: number };
const shortAddress = (address: string) => `${address.slice(0, 7)}…${address.slice(-5)}`;

export function ChatRoom() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Chat unavailable");
      setMessages(payload.messages ?? []);
      if (!quiet) requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chat unavailable");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 12_000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  async function postMessage(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!account || !message || posting) return;
    setPosting(true); setError("");
    try {
      const address = account.address.toLowerCase();
      const timestamp = Date.now();
      const approval = `SLVRBLOX community chat\nWallet: ${address}\nTimestamp: ${timestamp}\nMessage: ${message}`;
      const signed = await dAppKit.signPersonalMessage({ message: new TextEncoder().encode(approval) });
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, message, timestamp, bytes: signed.bytes, signature: signed.signature }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to post message");
      setDraft("");
      await loadMessages();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message was not posted");
    } finally { setPosting(false); }
  }

  return <main className="chat-page">
    <header className="chat-header"><Link href="/" className="chat-brand"><img src="/brand/slvrblox-logo.png" alt="SLVRBLOX" /></Link><nav><Link href="/">Mine</Link><Link href="/explore">Explore</Link><Link href="/airdrop">Airdrop</Link><Link className="active" href="/chat">Chat</Link></nav><span><i /> Sui Testnet</span></header>
    <section className="chat-shell">
      <div className="chat-title"><div><p>WALLET-VERIFIED COMMUNITY</p><h1>Miner Chat</h1><span>Talk strategy, report test results, and meet other SLVRBLOX miners.</span></div><b>{messages.length} recent messages</b></div>
      <div className="chat-feed" aria-live="polite">
        {loading ? <p className="chat-empty">Loading community chat…</p> : messages.length ? messages.map((item) => <article className={item.address === account?.address.toLowerCase() ? "mine" : ""} key={item.id}>
          <div><strong>{item.username || shortAddress(item.address)}</strong>{item.username && <code>{shortAddress(item.address)}</code>}<time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
          <p>{item.message}</p>
        </article>) : <p className="chat-empty">No messages yet. Be the first miner to say hello.</p>}
        <div ref={bottomRef} />
      </div>
      <form className="chat-composer" onSubmit={postMessage}>
        {account ? <><div className="chat-identity"><span>Posting as</span><strong>{shortAddress(account.address)}</strong><em>Wallet signature required</em></div><textarea value={draft} maxLength={500} rows={3} placeholder="Write a message to the community…" onChange={(event) => setDraft(event.target.value)} /><div className="chat-actions"><small>{draft.length}/500</small><button disabled={!draft.trim() || posting}>{posting ? "Waiting for approval…" : "Sign & post"}</button></div></> : <div className="chat-locked"><strong>Connect your wallet to join the chat.</strong><span>Reading is public. Posting requires a verified Sui wallet signature.</span><Link href="/">Connect wallet on Mine →</Link></div>}
        {error && <p className="chat-error">{error}</p>}
      </form>
      <p className="chat-rules">Community messages are public. Never share seed phrases, private keys, or personal information. SLVRBLOX staff will never ask for them.</p>
    </section>
  </main>;
}
