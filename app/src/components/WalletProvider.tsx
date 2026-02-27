"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet as _useWallet,
  useConnection as _useConnection,
} from "@solana/wallet-adapter-react";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";

const HELIUS_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC ??
  "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";

// Re-export so every existing import across the app keeps working unchanged
export const useWallet     = _useWallet;
export const useConnection = _useConnection;

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
    new WalletConnectWalletAdapter({
      network: "mainnet-beta" as any,
      options: {
        projectId: "cd49d0451b58bfe68d7ecbcf45aceb6b",
        metadata: {
          name: "FanStake",
          description: "The stock market for music artists",
          url: "https://fanstake.app",
          icons: ["https://fanstake.app/icon.png"],
        },
      },
    }),
  ], []);

  return (
    <ConnectionProvider endpoint={HELIUS_RPC}>
      <WalletProvider
        wallets={wallets}
        autoConnect={true}
        onError={(err) => {
          if (!err.message?.includes("User rejected")) {
            console.error("[WalletProvider]", err.name, err.message);
          }
        }}
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
};
