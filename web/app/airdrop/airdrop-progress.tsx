"use client";

import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useEffect, useState } from "react";

type Progress = {
  qualifyingRounds: number;
  activeDays: number;
  currentLevel: string;
  nextLevel: { name: string; rounds: number; days: number } | null;
  progress: number;
};

export function AirdropProgress() {
  const account = useCurrentAccount();
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!account?.address) { setData(null); setError(""); return; }
    let active = true;
    setData(null);
    setError("");
    fetch(`/api/airdrop?address=${encodeURIComponent(account.address)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Progress unavailable");
        if (active) setData(payload);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Progress unavailable"); });
    return () => { active = false; };
  }, [account?.address]);

  if (!account) return <section className="airdrop-progress-card signed-out" aria-label="Airdrop progress">
    <p>YOUR TESTNET PROGRESS</p><h2>Connect your wallet to view your level.</h2>
    <span>Progress follows your Sui wallet across devices.</span><Link href="/">Connect on the mining grid →</Link>
  </section>;

  return <section className="airdrop-progress-card" aria-label="Airdrop progress">
    <div className="airdrop-progress-heading"><div><p>YOUR TESTNET PROGRESS</p><h2>{data?.currentLevel ?? (error ? "Progress unavailable" : "Reading Sui history…")}</h2></div><code>{account.address.slice(0, 8)}...{account.address.slice(-6)}</code></div>
    {error ? <p className="airdrop-progress-error">{error}. Please refresh in a moment.</p> : <>
      <div className="airdrop-progress-stats"><div><strong>{data?.qualifyingRounds ?? "—"}</strong><span>QUALIFYING ROUNDS</span></div><div><strong>{data?.activeDays ?? "—"}</strong><span>ACTIVE DAYS (UTC)</span></div></div>
      <div className="airdrop-level-track"><i style={{ width: `${data?.progress ?? 0}%` }} /></div>
      <div className="airdrop-next"><span>{data?.nextLevel ? `Next: ${data.nextLevel.name}` : "Highest level achieved"}</span><strong>{data?.nextLevel ? `${data.qualifyingRounds}/${data.nextLevel.rounds} rounds · ${data.activeDays}/${data.nextLevel.days} days` : "100%"}</strong></div>
    </>}
  </section>;
}
