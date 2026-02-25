"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useWallet } from "./WalletProvider";

const QRConnect = dynamic(() => import("./QRConnect").then((m) => m.QRConnect), { ssr: false });

interface WalletButtonProps {
  className?: string;
  compact?: boolean;
}

export function WalletButton({ className, compact = false }: WalletButtonProps) {
  const {
    publicKey,
    connected,
    connecting,
    metaMaskBlocking,
    dismissMetaMaskWarning,
    connect,
    disconnect,
  } = useWallet();
  const [isMobile, setIsMobile] = useState(false);
  const [hasPhantom, setHasPhantom] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    setHasPhantom(
      win?.phantom?.solana?.isPhantom || win?.solana?.isPhantom || false
    );
  }, []);

  const short = publicKey
    ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`
    : null;

  const base =
    "inline-flex items-center gap-1.5 font-medium rounded-lg transition cursor-pointer select-none whitespace-nowrap";
  const sizeClass = compact ? "text-xs px-2.5 py-1.5" : "text-sm px-4 py-2";

  // ── MetaMask blocking modal ──────────────────────────────────────────────
  if (metaMaskBlocking) {
    const modal = (
      <>
        {showQR && <QRConnect onClose={() => setShowQR(false)} />}
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-8 overflow-y-auto ${showQR ? "hidden" : ""}`}>
          <div className="bg-gray-900 border border-yellow-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <h3 className="font-bold text-white">MetaMask is blocking Phantom</h3>
              </div>
              <button
                onClick={dismissMetaMaskWarning}
                className="text-gray-500 hover:text-white text-xl leading-none ml-2"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-5">
              MetaMask&apos;s security scripts block other wallets in the same browser.
              Pick a fix:
            </p>

            <div className="space-y-3">
              {/* Option 1: Scan QR */}
              <button
                onClick={() => setShowQR(true)}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
              >
                📱 Scan QR code with your phone
              </button>

              {/* Option 2: Disable MetaMask */}
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase mb-2">Or — Desktop fix</p>
                <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                  <li>Open <strong>chrome://extensions</strong></li>
                  <li>Toggle <strong>MetaMask OFF</strong></li>
                  <li>Press <span className="font-mono text-gray-400">Cmd+Shift+R</span></li>
                  <li>Connect Phantom normally</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </>
    );

    // Render via portal so it escapes any stacking context (e.g. header's backdrop-filter)
    return mounted ? createPortal(modal, document.body) : null;
  }

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

  // ── Mobile without Phantom injected → deep-link ──────────────────────────
  if (isMobile && !hasPhantom) {
    const currentUrl = typeof window !== "undefined"
      ? encodeURIComponent(window.location.href) : "";
    const origin = typeof window !== "undefined"
      ? encodeURIComponent(window.location.origin) : "";
    return (
      <a
        href={`https://phantom.app/ul/browse/${currentUrl}?ref=${origin}`}
        className={`${base} ${sizeClass} bg-purple-600 hover:bg-purple-500 text-white ${className ?? ""}`}
      >
        {compact ? "🔮" : "🔮 Open in Phantom"}
      </a>
    );
  }

  // ── Default connect button ───────────────────────────────────────────────
  return (
    <>
      {showQR && <QRConnect onClose={() => setShowQR(false)} />}
      <div className="flex items-center gap-1.5">
        <button
          onClick={connect}
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
            title="Scan QR code with phone"
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
