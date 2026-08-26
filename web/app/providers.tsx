
"use client";

import { DAppKitProvider, useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection, useWallets } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { dAppKit } from "./dapp-kit";

export const walletPreferenceKey = "slvrblox-preferred-wallet";

function WalletSessionBridge() {
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const wallets = useWallets();
  const connection = useWalletConnection();
  const kit = useDAppKit();
  const attemptedRestore = useRef(false);

  useEffect(() => {
    if (account && currentWallet) window.localStorage.setItem(walletPreferenceKey, currentWallet.name);
  }, [account, currentWallet]);

  useEffect(() => {
    if (account || connection.isConnecting || attemptedRestore.current) return;
    const preferredName = window.localStorage.getItem(walletPreferenceKey);
    if (!preferredName) return;
    const preferredWallet = wallets.find((wallet) => wallet.name === preferredName);
    if (!preferredWallet) return;
    attemptedRestore.current = true;
    void kit.connectWallet({ wallet: preferredWallet }).catch(() => undefined);
  }, [account, connection.isConnecting, kit, wallets]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>
    <DAppKitProvider dAppKit={dAppKit}><WalletSessionBridge />{children}</DAppKitProvider>
  </QueryClientProvider>;
}

