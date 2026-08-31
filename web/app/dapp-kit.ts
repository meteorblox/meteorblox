
import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const grpcUrls = {
  testnet: process.env.NEXT_PUBLIC_SUI_GRPC_URL ?? "https://fullnode.testnet.sui.io:443",
} as const;

export const dAppKit = createDAppKit({
  networks: ["testnet"],
  defaultNetwork: "testnet",
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: grpcUrls[network] }),
  autoConnect: true,
  slushWalletConfig: { appName: "SLVRBLOX" },
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

