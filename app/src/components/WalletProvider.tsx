"use client";

import {
  FC, ReactNode, createContext, useContext,
  useState, useEffect, useCallback, useMemo,
} from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface PhantomProvider {
  publicKey: { toBytes: () => Uint8Array; toString: () => string } | null;
  isConnected: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (msg: Uint8Array) => Promise<{ signature: Uint8Array }>;
}

interface WalletContextValue {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  metaMaskBlocking: boolean;
  dismissMetaMaskWarning: () => void;
  wallet: PhantomProvider | null;
  connection: Connection;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>) | null;
  signAllTransactions: (<T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>) | null;
}

// ── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletContextProvider");
  return ctx;
}

export function useConnection(): { connection: Connection } {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useConnection must be used inside WalletContextProvider");
  return { connection: ctx.connection };
}

// ── Provider ─────────────────────────────────────────────────────────────────

const DEVNET_RPC = process.env.NEXT_PUBLIC_HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const connection = useMemo(() => new Connection(DEVNET_RPC, "confirmed"), []);

  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [metaMaskBlocking, setMetaMaskBlocking] = useState(false);

  useEffect(() => setMounted(true), []);

  // Get Phantom provider — checks both modern and legacy injection points
  const getPhantom = useCallback((): PhantomProvider | null => {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (win?.phantom?.solana?.isPhantom) return win.phantom.solana as PhantomProvider;
    if (win?.solana?.isPhantom) return win.solana as PhantomProvider;
    return null;
  }, []);

  // Poll for Phantom — handles slow/async injection (MetaMask SES can delay it)
  const waitForPhantom = useCallback(
    (timeoutMs = 3000): Promise<PhantomProvider | null> =>
      new Promise((resolve) => {
        const immediate = getPhantom();
        if (immediate) return resolve(immediate);
        const interval = setInterval(() => {
          const p = getPhantom();
          if (p) { clearInterval(interval); clearTimeout(timer); resolve(p); }
        }, 50);
        const timer = setTimeout(() => { clearInterval(interval); resolve(null); }, timeoutMs);
      }),
    [getPhantom]
  );

  // Listen for account changes
  useEffect(() => {
    const phantom = getPhantom();
    if (!phantom) return;

    const onConnect = (pk: { toString: () => string }) => {
      setPublicKey(new PublicKey(pk.toString()));
      setConnected(true);
    };
    const onDisconnect = () => {
      setPublicKey(null);
      setConnected(false);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (phantom as any).on?.("connect", onConnect);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (phantom as any).on?.("disconnect", onDisconnect);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (phantom as any).off?.("connect", onConnect);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (phantom as any).off?.("disconnect", onDisconnect);
    };
  }, [getPhantom, mounted]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      // Poll up to 3s for Phantom to inject (handles MetaMask SES timing delays)
      const provider = await waitForPhantom(3000);

      if (!provider) {
        if (isMobile) {
          // Deep-link into Phantom's in-app browser on mobile
          const currentUrl = encodeURIComponent(window.location.href);
          window.location.href = `https://phantom.app/ul/browse/${currentUrl}?ref=${encodeURIComponent(window.location.origin)}`;
        } else {
          // Desktop: Phantom not detected — could be MetaMask blocking or not installed
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hasMetaMask = !!(window as any)?.ethereum?.isMetaMask;
          if (hasMetaMask) {
            setMetaMaskBlocking(true);
          } else {
            window.open("https://phantom.app", "_blank");
          }
        }
        return;
      }

      const resp = await provider.connect();
      const pk = resp?.publicKey ?? provider.publicKey;
      if (!pk) throw new Error("No public key returned");
      setPublicKey(new PublicKey(pk.toString()));
      setConnected(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        // User cancelled — silent
        console.log("User rejected wallet connection");
        return;
      }
      if (msg.includes("Unexpected error") || msg.includes("SES") || msg.includes("lockdown")) {
        setMetaMaskBlocking(true);
        return;
      }
      console.error("Phantom connect error:", err);
    } finally {
      setConnecting(false);
    }
  }, [waitForPhantom]);

  const disconnect = useCallback(async () => {
    const phantom = getPhantom();
    if (!phantom) return;
    await phantom.disconnect();
    setPublicKey(null);
    setConnected(false);
  }, [getPhantom]);

  const phantom = mounted ? getPhantom() : null;
  const dismissMetaMaskWarning = useCallback(() => setMetaMaskBlocking(false), []);

  const value: WalletContextValue = {
    publicKey,
    connected,
    connecting,
    metaMaskBlocking,
    dismissMetaMaskWarning,
    wallet: phantom,
    connection,
    connect,
    disconnect,
    signTransaction: phantom?.signTransaction?.bind(phantom) ?? null,
    signAllTransactions: phantom?.signAllTransactions?.bind(phantom) ?? null,
  };

  return (
    <WalletContext.Provider value={value}>
      {mounted ? children : null}
    </WalletContext.Provider>
  );
};
