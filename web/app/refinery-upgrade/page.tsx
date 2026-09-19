"use client";
import { useEffect, useState } from "react";
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { refineryUpgradeData } from "../refinery-upgrade-data";
import styles from "./page.module.css";
import { approvedCapTransfer, buildApprovedCapTransfer } from "../upgrade-cap-transfer";
import { walletPreferenceKey } from "../providers";
import { prepareOwnerTransaction } from "../owner-transaction";

type Status = { capId: string; gameId: string; refineryId: string; refineryV2Id: string; owner: string | null; gameAdmin: string; packageId: string; version: string; policy: number; active: boolean; candidateMatches: boolean; upgradeReady: boolean; activationReady: boolean };
export default function RefineryUpgrade() {
  const account = useCurrentAccount(), dAppKit = useDAppKit(), wallets = useWallets();
  const currentWallet = useCurrentWallet();
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  async function refresh() {
    const response = await fetch("/api/refinery-upgrade", { cache: "no-store" });
    const next = await response.json();
    if (!response.ok) throw new Error(next.error ?? "Status unavailable");
    setStatus(next); return next as Status;
  }
  useEffect(() => { void refresh().catch((error) => setNotice(error.message)); }, []);
  async function selectWallet(wallet?: (typeof wallets)[number]) {
    setBusy(true);
    try {
      window.localStorage.removeItem(walletPreferenceKey);
      if (currentWallet) {
        setNotice(`Disconnecting ${currentWallet.name} from this site...`);
        await dAppKit.disconnectWallet();
      }
      if (!wallet) { setNotice("Disconnected. Choose the wallet you want to use."); return; }
      setNotice(`Open ${wallet.name} and approve the connection on Sui Testnet.`);
      const result = await dAppKit.connectWallet({ wallet });
      if (!result.accounts.length) throw new Error(`${wallet.name} did not authorize a Sui Testnet account. Select Testnet in that wallet and try again.`);
      setNotice(`Connected with ${wallet.name}. Check the connected address before reviewing a transaction.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection failed");
    } finally { setBusy(false); }
  }
  async function transferUpgradeCap() {
    if (!account) return;
    setBusy(true);
    let completedDigest = "";
    try {
      const fresh = await refresh();
      const transaction = buildApprovedCapTransfer(account.address, fresh);
      const client = dAppKit.getClient("testnet");
      setNotice("Simulating the approved UpgradeCap transfer and estimating test SUI gas...");
      await transaction.build({ client });
      const simulation = await client.core.simulateTransaction({ transaction, include: { effects: true } });
      const simulated = simulation.Transaction ?? simulation.FailedTransaction;
      if (!simulated.status.success) throw new Error(simulated.status.error?.message ?? "Transfer simulation failed");
      const changes = simulated.effects?.changedObjects ?? [];
      const capChange = changes.find((change) => change.objectId === approvedCapTransfer.capId);
      if (capChange?.outputOwner?.$kind !== "AddressOwner" || capChange.outputOwner.AddressOwner !== approvedCapTransfer.to ||
          changes.some((change) => change.objectId !== approvedCapTransfer.capId && change.objectId !== simulated.effects?.gasObject?.objectId)) {
        throw new Error("Transfer simulation returned unexpected ownership or object changes.");
      }
      setNotice("Review in Slush: transfer one UpgradeCap to Suiet ending 42b7b2. This transfers contract upgrade authority; activation stays with Slush.");
      const result = await dAppKit.signAndExecuteTransaction({ transaction, account, network: "testnet" });
      if ("FailedTransaction" in result && result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Transfer failed");
      completedDigest = result.Transaction.digest;
      await client.core.waitForTransaction({ digest: completedDigest });
      await refresh();
      setNotice(`UpgradeCap transferred. Choose Suiet below, then review the contract upgrade. Activation still uses Slush. Transaction: ${completedDigest}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Transfer failed";
      setNotice(completedDigest ? `Transfer submitted; status refresh failed: ${detail}. Transaction: ${completedDigest}. Refresh status before continuing.` : detail);
    } finally { setBusy(false); }
  }
  async function submit(activate: boolean) {
    if (!account) return;
    setBusy(true);
    try {
      const fresh = await refresh();
      const expectedOwner = activate ? fresh.gameAdmin : fresh.owner;
      if (account.address.toLowerCase() !== expectedOwner?.toLowerCase()) throw new Error("Connect the owner wallet shown below.");
      if (activate ? !fresh.activationReady : !fresh.upgradeReady) throw new Error("Contract state changed; this action is unavailable.");
      const transaction = new Transaction(); transaction.setSender(account.address);
      if (activate) {
        transaction.moveCall({ target: `${fresh.packageId}::game::enable_paged_refinery`, arguments: [transaction.object(fresh.gameId), transaction.object(fresh.refineryId), transaction.object(fresh.refineryV2Id)] });
      } else {
        const cap = transaction.object(fresh.capId);
        const ticket = transaction.moveCall({ target: "0x2::package::authorize_upgrade", arguments: [cap, transaction.pure.u8(fresh.policy), transaction.pure.vector("u8", refineryUpgradeData.digest)] });
        const receipt = transaction.upgrade({ modules: [...refineryUpgradeData.modules], dependencies: [...refineryUpgradeData.dependencies], package: fresh.packageId, ticket });
        transaction.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, receipt] });
      }
      setNotice("Checking the transaction and estimating test SUI gas...");
      await prepareOwnerTransaction(transaction, dAppKit.getClient("testnet"));
      setNotice(activate ? "Review activation in your wallet." : "Review the contract upgrade in your wallet. Rewards stay on the current storage until step 2.");
      const result = await dAppKit.signAndExecuteTransaction({ transaction, account, network: "testnet" });
      if ("FailedTransaction" in result && result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      setNotice(`${activate ? "Paged rewards activated" : "Upgrade completed; activation is still separate"}. Transaction: ${result.Transaction.digest}`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Transaction failed"); }
    finally { setBusy(false); }
  }
  return <main className={styles.panel}>
    <p>SUI TESTNET · OWNER CONTROLS</p><h1>Refinery storage upgrade</h1>
    <p>New rewards will be stored in pages of up to 128 entries. Existing balances and seven-day refining times are preserved. Larger claims use separate approvals.</p>
    <p>Two separate wallet approvals are required: install the reviewed code, then activate it. Each transaction uses test SUI for gas.</p>
    <p>Local rehearsal: appending a reward to 4,426 existing entries cost about 0.00287 SUI with paging versus 0.02167 SUI with the old list. These are local measurements, not live fee guarantees.</p>
    <p>Contract version: {status?.version ?? "Loading…"}. Paging: {status?.active ? "Active" : "Not active"}.</p>
    <p style={{ overflowWrap: "anywhere" }}>Upgrade owner: {status?.owner ?? "Loading…"}<br />Activation owner: {status?.gameAdmin ?? "Loading…"}<br />Connected: {account?.address ?? "No wallet connected"}</p>
    <p>Wallet: {currentWallet?.name ?? "Not connected"}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {wallets.map((wallet) => <button key={wallet.name} disabled={busy} onClick={() => selectWallet(wallet)}>{account ? "Use" : "Connect"} {wallet.name}</button>)}
      {currentWallet && <button disabled={busy} onClick={() => selectWallet()}>Disconnect wallet</button>}
    </div>
    {status?.owner === approvedCapTransfer.from && status.upgradeReady && <section className={styles.transfer}>
      <h2>Approved move to Suiet</h2>
      <p>Transfer the contract’s UpgradeCap from Slush ending 114781 to your Suiet wallet. The receiving wallet will control future contract upgrades. Game activation authority stays with Slush.</p>
      <p style={{ overflowWrap: "anywhere" }}>Receiving address: <strong>{approvedCapTransfer.to}</strong></p>
      <p>This transaction transfers one UpgradeCap and uses test SUI for gas. It does not upgrade or activate the contract.</p>
      <button disabled={busy || !account || account.address.toLowerCase() !== approvedCapTransfer.from} onClick={transferUpgradeCap}>Review UpgradeCap transfer to Suiet</button>
    </section>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "24px 0" }}>
      <button disabled={busy || !account || !status?.upgradeReady || account.address.toLowerCase() !== status.owner?.toLowerCase()} onClick={() => submit(false)}>1. Review contract upgrade</button>
      <button disabled={busy || !account || !status?.activationReady || account.address.toLowerCase() !== status.gameAdmin?.toLowerCase()} onClick={() => submit(true)}>2. Review activation</button>
      <button disabled={busy} onClick={() => refresh().catch((error) => setNotice(error.message))}>Refresh status</button>
    </div>
    <p role="status" style={{ overflowWrap: "anywhere" }}>{notice}</p>
    <p><a href="/mine">Return to game</a></p>
  </main>;
}
