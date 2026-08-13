
import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const grpcUrls = {
  testnet: "https://fullnode.testnet.sui.io:443",
} as const;

export const dAppKit = createDAppKit({
  networks: ["testnet"],
  defaultNetwork: "testnet",
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: grpcUrls[network] }),
  autoConnect: true,
  slushWalletConfig: { name: "MeteorBlox" },
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

