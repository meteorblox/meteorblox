"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type GameHealth = { keeperSui: number; keeperLow: boolean; alertsConfigured: boolean; globalAutoplay: { packageVersion: number; pendingPlans: number } };
type ExploreHealth = { auditSummary: { mismatches: number } };
type Gate = { id: string; title: string; note: string; group: string; critical?: boolean };

const gates: Gate[] = [
  { id: "move-audit", title: "Independent Move security review completed", note: "Resolve every critical or high-severity finding before publishing Mainnet.", group: "Contracts & game", critical: true },
  { id: "mainnet-rehearsal", title: "Full deployment rehearsal completed", note: "Repeat package publish, object creation, keeper startup, and recovery on Testnet.", group: "Contracts & game", critical: true },
  { id: "game-load", title: "Heavy-load autoplay and settlement test passed", note: "Test beyond expected launch load and retain the results.", group: "Contracts & game" },
  { id: "claims", title: "SUI and DSLVR claims fully verified", note: "Cover split and individual wins, gradual refinement, early withdrawal, and large claim counts.", group: "Contracts & game", critical: true },
  { id: "allocations", title: "Final token allocations approved", note: "Record presale, liquidity, treasury, team, airdrop, and rewards amounts before minting.", group: "Treasury & token", critical: true },
  { id: "multisig", title: "Treasury and upgrade authority secured", note: "Use documented multisig controls, signer backups, and transaction review rules.", group: "Treasury & token", critical: true },
  { id: "vesting", title: "Team allocation and vesting locked", note: "Publish the schedule and prevent unexpected unlocked supply.", group: "Treasury & token" },
  { id: "airdrop", title: "50,000 DSLVR airdrop rules finalized", note: "Freeze eligibility, weights, snapshot timing, exclusions, and treasury fallback.", group: "Treasury & token" },
  { id: "sale", title: "Presale and affiliate payouts audited", note: "Verify $0.40 pricing, minimum purchase, refunds, caps, commissions, and final accounting.", group: "Presale & liquidity", critical: true },
  { id: "terms", title: "Buyer disclosures and sale terms published", note: "State risks, eligibility, delivery, refund rules, and jurisdiction limits clearly.", group: "Presale & liquidity", critical: true },
  { id: "liquidity", title: "Opening liquidity plan funded and approved", note: "Set the token/SUI ratio, opening price, slippage limits, LP ownership, and reserve.", group: "Presale & liquidity", critical: true },
  { id: "buybacks", title: "Buyback policy has objective limits", note: "Define its funding source, maximum spend, cadence, reporting, and pause conditions.", group: "Presale & liquidity" },
  { id: "keeper", title: "Keeper failure and recovery runbook tested", note: "Cover low gas, RPC outage, stalled rounds, duplicate execution, and key rotation.", group: "Operations", critical: true },
  { id: "alerts", title: "Alerts reach primary and backup contacts", note: "Test keeper, round, accounting, API, database, and deployment alerts end to end.", group: "Operations" },
  { id: "backups", title: "Keys, settings, and databases recoverable", note: "Prove recovery using the backup rather than only confirming one exists.", group: "Operations", critical: true },
  { id: "incident", title: "Incident communication plan prepared", note: "Prepare status, pause, recovery, and post-incident message templates.", group: "Operations" },
  { id: "legal", title: "Independent legal and compliance review completed", note: "Cover the sale, game, promotions, affiliates, claims, and supported regions.", group: "Legal & launch", critical: true },
  { id: "docs", title: "Whitepaper and website match deployed behavior", note: "Final numbers, fees, rewards, refinery, risks, and allocations agree everywhere.", group: "Legal & launch" },
  { id: "support", title: "Launch support coverage scheduled", note: "Assign transaction, chat, treasury, reports, and deployment monitoring.", group: "Legal & launch" },
  { id: "go-no-go", title: "Final multisig go/no-go review signed", note: "Do not launch while any critical gate remains open.", group: "Legal & launch", critical: true },
];

const storageKey = "slvrblox-mainnet-readiness-v1";

export default function ReadinessPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [game, setGame] = useState<GameHealth | null>(null);
  const [explore, setExplore] = useState<ExploreHealth | null>(null);
  const [chatOnline, setChatOnline] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    try { setDone(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")); } catch { setDone({}); }
    Promise.allSettled([fetch("/api/game", { cache: "no-store" }), fetch("/api/explore", { cache: "no-store" }), fetch("/api/chat", { cache: "no-store" })]).then(async ([g, e, c]) => {
      if (g.status === "fulfilled" && g.value.ok) setGame(await g.value.json());
      if (e.status === "fulfilled" && e.value.ok) setExplore(await e.value.json());
      setChatOnline(c.status === "fulfilled" && c.value.ok);
      setCheckedAt(Date.now());
    });
  }, []);

  const toggle = (id: string) => setDone((current) => {
    const next = { ...current, [id]: !current[id] };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  const completed = gates.filter((gate) => done[gate.id]).length;
  const criticalOpen = gates.filter((gate) => gate.critical && !done[gate.id]).length;
  const progress = Math.round((completed / gates.length) * 100);
  const groups = useMemo(() => [...new Set(gates.map((gate) => gate.group))], []);
  const liveChecks = [
    { label: "Contract version 9+", ok: (game?.globalAutoplay.packageVersion ?? 0) >= 9, value: game ? `v${game.globalAutoplay.packageVersion}` : "Checking" },
    { label: "No autoplay backlog", ok: game?.globalAutoplay.pendingPlans === 0, value: game ? `${game.globalAutoplay.pendingPlans} pending` : "Checking" },
    { label: "Keeper funding healthy", ok: game ? !game.keeperLow : false, value: game ? `${game.keeperSui.toFixed(3)} SUI` : "Checking" },
    { label: "Accounting clean", ok: explore?.auditSummary.mismatches === 0, value: explore ? `${explore.auditSummary.mismatches} mismatches` : "Checking" },
    { label: "Operations alerts enabled", ok: game?.alertsConfigured === true, value: game?.alertsConfigured ? "Enabled" : "Checking" },
    { label: "Community chat online", ok: chatOnline, value: chatOnline ? "Online" : "Checking" },
  ];

  return <main className="readiness-page">
    <header className="status-topbar"><Link href="/" className="status-brand"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></Link><nav><Link href="/">Mine</Link><Link href="/explore">Explore</Link><Link href="/status">Status</Link><Link className="active" href="/readiness">Readiness</Link></nav><span><i /> Owner operations</span></header>
    <section className="readiness-hero"><div><p>MAINNET CONTROL ROOM</p><h1>Launch readiness</h1><span>Live health confirms the system is running. Launch gates confirm it is safe and prepared to go Mainnet.</span></div><div className="readiness-score"><strong>{progress}%</strong><span>{completed} of {gates.length} gates complete</span><i><b style={{ width: `${progress}%` }} /></i></div></section>
    <section className={`readiness-decision ${criticalOpen ? "hold" : "review"}`}><div><small>CURRENT DECISION</small><strong>{criticalOpen ? "HOLD FOR MAINNET" : "READY FOR FINAL GO/NO-GO REVIEW"}</strong><span>{criticalOpen ? `${criticalOpen} critical launch ${criticalOpen === 1 ? "gate remains" : "gates remain"}. Testnet can continue while these are completed.` : "All critical gates are checked. Complete the signer review before launch."}</span></div><em>{criticalOpen} critical open</em></section>
    <section className="readiness-live"><header><div><p>LIVE TESTNET SIGNALS</p><h2>System health</h2></div><span>{checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString()}` : "Checking now…"}</span></header><div>{liveChecks.map((check) => <article key={check.label} className={check.ok ? "pass" : "waiting"}><i>{check.ok ? "✓" : "·"}</i><span><strong>{check.label}</strong><small>{check.value}</small></span></article>)}</div></section>
    <section className="readiness-gates"><header><div><p>LAUNCH GATES</p><h2>Owner checklist</h2></div><span>Check an item only when evidence exists. Progress saves on this device.</span></header>{groups.map((group) => { const items = gates.filter((gate) => gate.group === group); const groupDone = items.filter((gate) => done[gate.id]).length; return <section className="readiness-group" key={group}><header><div><h3>{group}</h3><span>{groupDone}/{items.length} complete</span></div><i><b style={{ width: `${(groupDone / items.length) * 100}%` }} /></i></header>{items.map((gate) => <button type="button" className={done[gate.id] ? "complete" : ""} onClick={() => toggle(gate.id)} key={gate.id}><i>{done[gate.id] ? "✓" : ""}</i><span><strong>{gate.title}{gate.critical && <em>CRITICAL</em>}</strong><small>{gate.note}</small></span></button>)}</section>; })}</section>
    <footer className="status-footer"><span>Mainnet is a separate deployment. Testnet balances and checks do not transfer automatically.</span><div><Link href="/status">Live status →</Link><Link href="/explore">Round audit →</Link></div></footer>
  </main>;
}
