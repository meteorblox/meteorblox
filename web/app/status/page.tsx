"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type GameStatus = {
  round: number; closesAtMs: number; remainingMs: number; settled: boolean;
  keeperSui: number; keeperLow: boolean; alertsConfigured: boolean; motherlodeDslvr: number;
  refineryTotals: { awardedDslvr: number; mintedDslvr: number; forfeitedDslvr: number; openPositions: number };
};
type ExploreStatus = {
  auditSummary: { checked: number; passed: number; mismatches: number; pending: number };
  rounds: Array<{ round: number; transaction: string | null; timestamp: string | null }>;
};
type MonitorState = { game: GameStatus | null; explore: ExploreStatus | null; chatOnline: boolean; refreshedAt: number; errors: string[] };

const initial: MonitorState = { game: null, explore: null, chatOnline: false, refreshedAt: 0, errors: [] };
const fmt = (value: number, digits = 4) => value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function StatusPage() {
  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const errors: string[] = [];
    const [gameResult, exploreResult, chatResult] = await Promise.allSettled([
      fetch("/api/game", { cache: "no-store" }),
      fetch("/api/explore", { cache: "no-store" }),
      fetch("/api/chat", { cache: "no-store" }),
    ]);
    const read = async <T,>(result: PromiseSettledResult<Response>, label: string): Promise<T | null> => {
      if (result.status === "rejected" || !result.value.ok) { errors.push(`${label} API unavailable`); return null; }
      return result.value.json() as Promise<T>;
    };
    const [game, explore] = await Promise.all([read<GameStatus>(gameResult, "Game"), read<ExploreStatus>(exploreResult, "Explore")]);
    const chatOnline = chatResult.status === "fulfilled" && chatResult.value.ok;
    if (!chatOnline) errors.push("Chat API unavailable");
    setState({ game, explore, chatOnline, refreshedAt: Date.now(), errors });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => { setState((current) => ({ ...current, refreshedAt: Date.now(), errors: ["Status refresh failed"] })); setLoading(false); });
    const timer = window.setInterval(() => refresh().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const alerts = useMemo(() => {
    const found = [...state.errors];
    if (state.game?.keeperLow) found.push("Keeper gas is below the operating threshold");
    if ((state.explore?.auditSummary.mismatches ?? 0) > 0) found.push(`${state.explore?.auditSummary.mismatches} accounting mismatch detected`);
    if (state.game && !state.game.settled && state.game.closesAtMs < Date.now() - 30_000) found.push("Current round is overdue for settlement");
    return found;
  }, [state]);

  const refinery = state.game?.refineryTotals;
  const outstanding = refinery ? Math.max(0, refinery.awardedDslvr - refinery.mintedDslvr - refinery.forfeitedDslvr) : 0;
  const audit = state.explore?.auditSummary;
  const latest = state.explore?.rounds[0];

  return <main className="status-page">
    <header className="status-topbar"><Link href="/" className="status-brand"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></Link><nav><Link href="/">Mine</Link><Link href="/explore">Explore</Link><Link className="active" href="/status">Status</Link></nav><span><i /> Sui Testnet</span></header>
    <section className="status-heading"><div><p>LIVE OPERATIONS</p><h1>Protocol status</h1><span>Automatic checks refresh every 15 seconds.</span></div><button onClick={() => { setLoading(true); refresh().catch(() => undefined); }}>{loading ? "Checking…" : "Refresh now"}</button></section>
    <section className={`status-banner ${alerts.length ? "warning" : "healthy"}`}><i /> <div><strong>{alerts.length ? "Attention required" : "All monitored systems operational"}</strong><span>{alerts.length ? alerts.join(" · ") : "Round engine, keeper, accounting, refinery, and community chat are responding normally."}</span></div></section>
    <section className="status-grid">
      <article><small>ROUND ENGINE</small><strong>#{String(state.game?.round ?? 0).padStart(6, "0")}</strong><dl><div><dt>State</dt><dd>{state.game?.settled ? "Settled" : "Open"}</dd></div><div><dt>Time remaining</dt><dd>{state.game ? `${Math.ceil(state.game.remainingMs / 1000)}s` : "—"}</dd></div><div><dt>Latest settled</dt><dd>{latest ? `#${latest.round}` : "—"}</dd></div></dl></article>
      <article><small>KEEPER GAS</small><strong>{state.game ? `${fmt(state.game.keeperSui, 3)} SUI` : "—"}</strong><dl><div><dt>Funding</dt><dd className={state.game?.keeperLow ? "bad" : "good"}>{state.game?.keeperLow ? "Low" : "Healthy"}</dd></div><div><dt>Automation</dt><dd>{state.game ? "Online" : "Unknown"}</dd></div><div><dt>Email alerts</dt><dd className={state.game?.alertsConfigured ? "good" : "bad"}>{state.game?.alertsConfigured ? "Enabled" : "Setup needed"}</dd></div><div><dt>Network</dt><dd>Testnet</dd></div></dl></article>
      <article><small>ACCOUNTING AUDIT</small><strong>{audit ? `${audit.passed}/${audit.checked}` : "—"}</strong><dl><div><dt>Verified</dt><dd className="good">{audit?.passed ?? "—"}</dd></div><div><dt>Mismatches</dt><dd className={audit?.mismatches ? "bad" : "good"}>{audit?.mismatches ?? "—"}</dd></div><div><dt>Pending index</dt><dd>{audit?.pending ?? "—"}</dd></div></dl></article>
      <article><small>DSLVR REFINERY</small><strong>{fmt(outstanding, 3)} DSLVR</strong><dl><div><dt>Awarded</dt><dd>{refinery ? fmt(refinery.awardedDslvr, 3) : "—"}</dd></div><div><dt>Minted</dt><dd>{refinery ? fmt(refinery.mintedDslvr, 3) : "—"}</dd></div><div><dt>Open positions</dt><dd>{refinery?.openPositions ?? "—"}</dd></div></dl></article>
      <article><small>MOTHERLODE</small><strong>{state.game ? fmt(state.game.motherlodeDslvr, 2) : "—"} DSLVR</strong><dl><div><dt>Tracking</dt><dd className={state.game ? "good" : "bad"}>{state.game ? "Online" : "Unavailable"}</dd></div><div><dt>Source</dt><dd>On-chain event</dd></div></dl></article>
      <article><small>COMMUNITY CHAT</small><strong className={state.chatOnline ? "good" : "bad"}>{state.chatOnline ? "ONLINE" : "OFFLINE"}</strong><dl><div><dt>Wallet verification</dt><dd>{state.chatOnline ? "Ready" : "Unavailable"}</dd></div><div><dt>Storage</dt><dd>{state.chatOnline ? "Connected" : "Unknown"}</dd></div></dl></article>
    </section>
    <footer className="status-footer"><span>Last checked {state.refreshedAt ? new Date(state.refreshedAt).toLocaleTimeString() : "—"}</span><div><Link href="/explore">View round audit →</Link><Link href="/">Back to mining →</Link></div></footer>
  </main>;
}
