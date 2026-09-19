"use client";

import Link from "next/link";
import { ActivityMeter } from "./activity-meter";
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { activationMessage, checkState, SENTINEL_VMH } from "./model";
import type { ProtocolCheck, SentinelNode } from "./model";

type Snapshot = { enabled: boolean; activationPaused: boolean; node: SentinelNode | null; checks: ProtocolCheck[] };
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const date = (timestamp: number) => new Date(timestamp).toLocaleString();
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const explorer = (kind: string, value: string) => `https://suiscan.xyz/testnet/${kind}/${encodeURIComponent(value)}`;

export function SentinelDashboard() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const wallet = useCurrentWallet();
  const wallets = useWallets();
  const queryClient = useQueryClient();
  const address = account?.address.toLowerCase() ?? "";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  useEffect(() => { setNotice(""); }, [address]);
  const query = useQuery({
    queryKey: ["sentinel", address],
    queryFn: async ({ signal }): Promise<Snapshot> => {
      const response = await fetch(`/api/sentinel${address ? `?address=${encodeURIComponent(address)}` : ""}`, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sentinel is unavailable");
      return payload;
    },
    refetchInterval: 30_000,
    retry: 1,
  });
  const data = query.data;
  const node = data?.node;
  const latest = data?.checks[0] ?? null;
  const health = checkState(latest, now);
  const status = query.isError ? "Connection unavailable" : query.isPending ? "Loading status" : !data?.enabled ? "Pilot preparing" : node ? "Activated" : "Ready to activate";

  async function activate() {
    if (!address || busy) return;
    setBusy(true); setNotice("");
    try {
      const timestamp = Date.now();
      const signed = await kit.signPersonalMessage({ message: new TextEncoder().encode(activationMessage(address, timestamp)) });
      const response = await fetch("/api/sentinel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, timestamp, bytes: signed.bytes, signature: signed.signature }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Activation failed");
      await queryClient.invalidateQueries({ queryKey: ["sentinel", address] });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Activation was not completed"); }
    finally { setBusy(false); }
  }

  return <main className="sentinel-page">
    <header className="sentinel-header"><Link href="/mine" className="sentinel-brand">SLVRBLOX</Link><nav aria-label="Main navigation"><Link href="/mine">Mine</Link><Link href="/stake">Stake</Link><Link href="/sentinel" aria-current="page">Sentinel</Link><Link href="/airdrop">Airdrop</Link></nav><span className="sentinel-chip">SUI TESTNET</span></header>
    <div className="sentinel-content">
      <section className="sentinel-heading"><p className="sentinel-eyebrow">EXPLORE. OBSERVE. HELP US IMPROVE.</p><h1>Sentinel <span>Test Nodes</span></h1><p>A new way to explore SLVRBLOX and help test protocol monitoring. No hardware required.</p></section>
      <div className="sentinel-columns">
        <section className="sentinel-card sentinel-node" aria-labelledby="node-title">
          <div className="sentinel-card-top"><span className="sentinel-eyebrow">YOUR TEST NODE</span><span className="sentinel-chip">FOUNDER TEST</span></div>
          <svg className="sentinel-emblem" viewBox="0 0 300 250" aria-hidden="true"><defs><radialGradient id="sentinel-halo"><stop stopColor="#2ca7e8" stopOpacity=".4"/><stop offset="1" stopColor="#2ca7e8" stopOpacity="0"/></radialGradient><linearGradient id="sentinel-metal" x2="1" y2="1"><stop stopColor="#c0eeff"/><stop offset=".5" stopColor="#327bb0"/><stop offset="1" stopColor="#a0efff"/></linearGradient></defs><circle cx="150" cy="125" r="120" fill="url(#sentinel-halo)"/><ellipse cx="150" cy="125" rx="125" ry="48" fill="none" stroke="#265f82" transform="rotate(-30 150 125)"/><ellipse cx="150" cy="125" rx="125" ry="48" fill="none" stroke="#265f82" transform="rotate(30 150 125)"/><path d="M150 37 226 81 226 169 150 213 74 169 74 81Z" fill="#0a223c" stroke="url(#sentinel-metal)" strokeWidth="7"/><path d="M150 66 201 96 201 154 150 184 99 154 99 96Z" fill="#123555" stroke="#73d9ff" strokeWidth="2"/><path d="M150 92 179 109 179 143 150 160 121 143 121 109Z" fill="#47bdf1"/><path d="M121 109 150 126 179 109M150 126V160" fill="none" stroke="#d9f8ff" strokeWidth="2"/><circle cx="42" cy="84" r="5" fill="#a0efff"/><circle cx="258" cy="169" r="5" fill="#a0efff"/></svg>
          <h2 id="node-title">Sentinel Node</h2><p className="sentinel-state" role="status">{status}</p>
          {address ? <p className="sentinel-wallet" title={address}>{short(address)}</p> : <p>Connect a wallet to activate your free test node.</p>}
          {!address && <div className="sentinel-wallets">{wallets.map((wallet) => <button key={wallet.name} disabled={busy} onClick={async () => { setBusy(true); setNotice(""); try { await kit.connectWallet({ wallet }); } catch { setNotice("Wallet connection was not completed."); } finally { setBusy(false); } }}>Connect {wallet.name}</button>)}{!wallets.length && <Link href="/mine">Open wallet options on Mine →</Link>}</div>}
          {address && <button disabled={busy} onClick={async () => { try { await kit.disconnectWallet(); } catch { setNotice("Unable to disconnect. Please try again."); } }}>Disconnect {wallet?.name ?? "wallet"}</button>}
          {address && !node && <button className="sentinel-primary" disabled={busy || query.isPending || query.isError || !data?.enabled || data.activationPaused} onClick={() => void activate()}>{busy ? "Waiting for wallet approval…" : !data?.enabled ? "Activation opens with the pilot" : data.activationPaused ? "Activation paused" : "Activate free test node"}</button>}
          {node && <p className="sentinel-caption">Activated {date(node.activatedAt)}. Your node is saved to this wallet.</p>}
          <p className="sentinel-caption">Activation uses a wallet message signature. No purchase, gas payment, or token transfer.</p>
          {notice && <p role="alert" className="sentinel-error">{notice}</p>}
        </section>
        <section className="sentinel-details" aria-label="Node details">
          <div className="sentinel-metrics"><article className="sentinel-card"><p>Fixed reward weight</p><strong>{node ? SENTINEL_VMH : "—"} <small>units</small></strong><span>Your assigned weight stays fixed. The activity meter does not affect rewards.</span></article><article className="sentinel-card"><p>Test rewards</p><strong className="sentinel-text-value">Not enabled yet</strong><span>Accrual and claiming are a later testing stage. No rewards are accumulating.</span></article></div>
          <article className="sentinel-card"><p className="sentinel-eyebrow">HOW THIS PILOT WORKS</p><h2>Help test the protocol dashboard</h2><p>Our hosted service observes SLVRBLOX game activity. Your test node gives you a place to review those observations and report what works or needs attention.</p><ul><li>Activate one free test node per wallet.</li><li>Return on different days and compare checks with game rounds.</li><li>Share dashboard, wallet, and mobile issues through <a href="https://discord.com/channels/1537270873587974174/1541589982962262187" target="_blank" rel="noreferrer">a private support ticket</a>.</li></ul><p className="sentinel-caption">The pilot runs alongside the game until it closes. Tester-airdrop rules will be published before qualifying activity begins; activation alone does not qualify.</p></article>
        </section>
      </div>
      <ActivityMeter checks={data?.checks ?? []} now={now} unavailable={query.isError || !data?.enabled} />
      <section className="sentinel-card sentinel-monitor" aria-labelledby="monitor-title"><div className="sentinel-monitor-heading"><div><p className="sentinel-eyebrow">SHARED PROTOCOL OBSERVATIONS</p><h2 id="monitor-title">Protocol-check history</h2></div><button disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh history"}</button></div>
        <p>Checks are recorded by the hosted monitor approximately once a minute. Refreshing reads saved observations; it does not count as a new protocol check or verified testing task.</p>
        {query.isError ? <p role="alert" className="sentinel-error">{query.error.message} Previously loaded observations may be out of date.</p> : <p className={`sentinel-health health-${health}`} role="status">{health === "waiting" ? "Waiting for the first recorded check." : health === "stale" ? "Monitoring is stale. No recent check has been recorded." : health === "unavailable" ? "A recent chain or settlement lookup was unavailable." : health === "attention" ? "The observed round is past its close time and remains unsettled. Review game activity." : "Latest observation is current. This is a snapshot, not a guarantee of service health."}</p>}
        {latest && <p className="sentinel-caption">Latest check: {date(latest.checkedAt)} · <a href={explorer("object", gameId)} target="_blank" rel="noreferrer">View testnet game object ↗</a></p>}
        {!!data?.checks.length && <div className="sentinel-table-scroll"><table><thead><tr><th>Checked</th><th>Game round</th><th>Game state</th><th>Latest settlement observed</th></tr></thead><tbody>{data.checks.map((check) => <tr key={check.checkedAt}><td>{date(check.checkedAt)}</td><td>{check.round ?? "Unavailable"}</td><td>{check.connection !== "ok" ? "Lookup unavailable" : check.settled ? "Settled" : check.playCount === 0 ? "Idle · waiting for play" : "Awaiting settlement"}</td><td>{check.settlement === "unavailable" ? "Lookup unavailable" : check.settlement === "none" ? "No event returned" : check.transaction ? <a href={explorer("tx", check.transaction)} target="_blank" rel="noreferrer">Round {check.lastSettledRound ?? "unknown"} ↗</a> : `Round ${check.lastSettledRound ?? "unknown"}`}</td></tr>)}</tbody></table></div>}
      </section>
      <footer className="sentinel-footer">SLVRBLOX Sentinel · Sui Testnet · Test nodes are temporary and do not grant a mainnet node. Test tokens have no monetary value.</footer>
    </div>
  </main>;
}
