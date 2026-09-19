import { Transaction } from "@mysten/sui/transactions";

export const approvedCapTransfer = {
  capId: "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d",
  from: "0x55f035832afb21499461d62630ed4b1cdf6e53b2a43f907e6db55a91eb114781",
  to: "0x5f8c82b3fa284ea57716323d6d71d258b6063a1a52a925c3a08b5bcd5f42b7b2",
} as const;

export function buildApprovedCapTransfer(sender: string, state: { capId: string; owner: string | null; upgradeReady: boolean }) {
  if (sender.toLowerCase() !== approvedCapTransfer.from || state.owner !== approvedCapTransfer.from ||
      state.capId !== approvedCapTransfer.capId || !state.upgradeReady) {
    throw new Error("The approved transfer is unavailable: connect the original owner and refresh contract status.");
  }
  const transaction = new Transaction();
  transaction.setSender(approvedCapTransfer.from);
  transaction.transferObjects([transaction.object(approvedCapTransfer.capId)], approvedCapTransfer.to);
  return transaction;
}
