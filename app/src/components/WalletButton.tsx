"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "./WalletProvider";

const WalletModal = dynamic(() => import("./WalletModal").then((m) => m.WalletModal), { ssr: false });
const QRConnect   = dynamic(() => import("./QRConnect").then((m) => m.QRConnect),     { ssr: false });

interface WalletButtonProps {
  className?: string;
  compact?: boolean;
}

export function WalletButton({ className, compact = false }: WalletButtonProps) {
  const { publicKey, connected, connecting, wallet, select, connect, disconnect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showQR,    setShowQR]    = useState(false);
  const [isMobile,  setIsMobile]  = useState(false);
  const [mounted,   setMounted]   = useState(false);

  // select() is async-React: the wallet state updates on the next render tick.
  // We wait 80ms after select() before calling connect() so the adapter is ready.
  // This avoids the stale-wallet-name bug where clicking the same wallet twice
  // (e.g. Phantom after a previous Phantom session) never fires the effect.

  useEffect(() => {
    setMounted(true);
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const handleSelect = (name: WalletName) => {
    setShowModal(false);
    select(name);
    // Give wallet-adapter one render tick to update its internal state, then connect.
    setTimeout(() => connect().catch(console.error), 80);
  };

  const short = publicKey
    ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`
    : null;

  const base      = "inline-flex items-center gap-1.5 font-medium rounded-lg transition cursor-pointer select-none whitespace-nowrap";
  const sizeClass = compact ? "text-xs px-2.5 py-1.5" : "text-sm px-4 py-2";

  if (!mounted) return null;

  // ── Modals ───────────────────────────────────────────────────────────────
  if (showQR) return <QRConnect onClose={() => setShowQR(false)} />;

  // ── Connected ────────────────────────────────────────────────────────────
  if (connected && short) {
    return (
      <button
        onClick={disconnect}
        className={`${base} ${sizeClass} bg-purple-700 hover:bg-purple-600 text-white ${className ?? ""}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block flex-shrink-0" />
        {short}
      </button>
    );
  }

  // ── Mobile — use WalletConnect or injected wallet ────────────────────────
  if (isMobile) {
    return (
      <>
        {showModal && (
          <WalletModal
            onClose={() => setShowModal(false)}
            onSelect={handleSelect}
          />
        )}
        <button
          onClick={() => setShowModal(true)}
          disabled={connecting}
          className={`${base} ${sizeClass} bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white ${className ?? ""}`}
        >
          {connecting
            ? (compact ? "..." : "Connecting...")
            : (compact ? "Connect" : "Connect Wallet")}
        </button>
      </>
    );
  }

  // ── Desktop connect button ────────────────────────────────────────────────
  return (
    <>
      {showModal && (
        <WalletModal
          onClose={() => setShowModal(false)}
          onSelect={handleSelect}
        />
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowModal(true)}
          disabled={connecting}
          className={`${base} ${sizeClass} bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white ${className ?? ""}`}
        >
          {connecting
            ? (compact ? "..." : "Connecting...")
            : (compact ? "Connect" : "Connect Wallet")}
        </button>
        {!compact && (
          <button
            onClick={() => setShowQR(true)}
            title="Scan QR with phone"
            className="p-2 text-gray-500 hover:text-white border border-gray-800 hover:border-gray-600 rounded-lg transition text-sm"
          >
            📱
          </button>
        )}
      </div>
    </>
  );
}

export const WalletButtonCompact = WalletButton;
