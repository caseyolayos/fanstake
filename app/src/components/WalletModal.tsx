"use client";

import { createPortal } from "react-dom";
import { WalletReadyState, WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "./WalletProvider";
import { useEffect, useState } from "react";

interface WalletModalProps {
  onClose: () => void;
  onSelect: (name: WalletName) => void;
}

export function WalletModal({ onClose, onSelect }: WalletModalProps) {
  const { wallets } = useWallet();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const walletConnect = wallets.find((w) => w.adapter.name === "WalletConnect");
  const installed = wallets.filter(
    (w) => w.adapter.name !== "WalletConnect" && (
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable
    )
  );
  const others = wallets.filter(
    (w) => w.adapter.name !== "WalletConnect" &&
           w.readyState !== WalletReadyState.Installed &&
           w.readyState !== WalletReadyState.Loadable
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg">Connect Wallet</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* WalletConnect — mobile primary */}
        {walletConnect && (
          <div className="mb-5">
            {isMobile && <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold mb-3">📱 Recommended for Mobile</p>}
            <button
              onClick={() => onSelect(walletConnect.adapter.name as WalletName)}
              className="w-full flex items-center gap-3 bg-purple-900/40 hover:bg-purple-900/70 border border-purple-600 hover:border-purple-400 rounded-xl px-4 py-3 transition"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={walletConnect.adapter.icon} alt="WalletConnect" className="w-8 h-8 rounded-lg" />
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">WalletConnect</p>
                <p className="text-purple-300 text-xs">Opens Phantom, Solflare &amp; more</p>
              </div>
              <span className="text-xs text-purple-400 font-semibold">→</span>
            </button>
          </div>
        )}

        {/* Installed wallets */}
        {installed.length > 0 && (
          <>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">Detected</p>
            <div className="space-y-2 mb-5">
              {installed.map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => onSelect(w.adapter.name as WalletName)}
                  className="w-full flex items-center gap-3 bg-gray-800 hover:bg-purple-900/50 border border-gray-700 hover:border-purple-500 rounded-xl px-4 py-3 transition group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.adapter.icon} alt={w.adapter.name} className="w-8 h-8 rounded-lg" />
                  <span className="text-white font-semibold text-sm flex-1 text-left">{w.adapter.name}</span>
                  <span className="text-xs text-green-400 font-semibold">Detected ✓</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Other wallets */}
        {others.length > 0 && (
          <>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">
              {installed.length > 0 ? "More Wallets" : "Select a Wallet"}
            </p>
            <div className="space-y-2">
              {others.map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => onSelect(w.adapter.name as WalletName)}
                  className="w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl px-4 py-3 transition opacity-70 hover:opacity-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.adapter.icon} alt={w.adapter.name} className="w-8 h-8 rounded-lg" />
                  <span className="text-white font-semibold text-sm flex-1 text-left">{w.adapter.name}</span>
                  <span className="text-xs text-gray-500">Install →</span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-gray-600 text-center mt-5">
          Works with Phantom, MetaMask, Coinbase &amp; more.{" "}
          <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
            Get Phantom →
          </a>
        </p>
      </div>
    </div>,
    document.body
  );
}
