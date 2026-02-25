"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface GatingPerk {
  type: "link" | "text" | "discord" | "download";
  title: string;
  url?: string;
  content?: string;
}

export interface GatingConfig {
  threshold: number; // display units (not raw lamport/token units)
  perks: GatingPerk[];
}

interface HolderGateProps {
  config: GatingConfig;
  symbol: string;
  tokenBalance: number | null; // display units
  isWalletConnected: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function perkIcon(type: GatingPerk["type"]): string {
  switch (type) {
    case "discord":  return "💬";
    case "download": return "⬇️";
    case "text":     return "💎";
    case "link":     return "🔗";
    default:         return "✨";
  }
}

// ---------------------------------------------------------------------------
// Single perk item (unlocked)
// ---------------------------------------------------------------------------
function PerkItem({ perk }: { perk: GatingPerk }) {
  const [revealed, setRevealed] = useState(false);

  if (perk.type === "text") {
    return (
      <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4">
        <p className="text-xs text-green-400 font-medium mb-2">💎 {perk.title}</p>
        {revealed ? (
          <p className="text-sm text-white font-mono break-all select-all">{perk.content}</p>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="text-xs bg-green-800/40 hover:bg-green-700/50 text-green-300 hover:text-green-200 px-3 py-1.5 rounded-lg transition"
          >
            Tap to reveal
          </button>
        )}
      </div>
    );
  }

  if (perk.url) {
    const isDiscord  = perk.type === "discord";
    const isDownload = perk.type === "download";
    return (
      <a
        href={perk.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 p-4 rounded-xl border transition group ${
          isDiscord
            ? "bg-indigo-900/20 border-indigo-800/50 hover:border-indigo-500 hover:bg-indigo-900/30"
            : "bg-green-900/20 border-green-800/50 hover:border-green-500 hover:bg-green-900/30"
        }`}
      >
        <span className="text-xl flex-shrink-0">{perkIcon(perk.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isDiscord ? "text-indigo-300" : "text-green-300"}`}>
            {perk.title}
          </p>
          {isDownload && (
            <p className="text-xs text-gray-500 mt-0.5">Click to download</p>
          )}
          {isDiscord && (
            <p className="text-xs text-indigo-500 mt-0.5 truncate">{perk.url}</p>
          )}
        </div>
        <span className={`text-sm flex-shrink-0 transition-transform group-hover:scale-110 ${isDiscord ? "text-indigo-400" : "text-green-400"}`}>
          {isDownload ? "⬇" : "↗"}
        </span>
      </a>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main HolderGate component
// ---------------------------------------------------------------------------
export function HolderGate({ config, symbol, tokenBalance, isWalletConnected }: HolderGateProps) {
  const held    = tokenBalance ?? 0;
  const needed  = Math.max(0, config.threshold - held);
  const hasAccess = isWalletConnected && tokenBalance !== null && tokenBalance >= config.threshold;

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isWalletConnected) {
    return (
      <div className="bg-gray-900 border border-purple-800 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="text-2xl mt-0.5">🔑</span>
          <div>
            <h3 className="text-sm font-bold text-white">Token-Gated Content</h3>
            <p className="text-xs text-gray-400 mt-1">
              Hold at least{" "}
              <span className="text-purple-300 font-semibold">
                {config.threshold.toLocaleString()} ${symbol}
              </span>{" "}
              to unlock exclusive content from this artist.
            </p>
          </div>
        </div>

        {/* Blurred perk preview */}
        <div className="space-y-2 mb-5 pointer-events-none select-none">
          {config.perks.map((perk, i) => (
            <div
              key={i}
              className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3 blur-[3px]"
            >
              <span className="text-lg">{perkIcon(perk.type)}</span>
              <div className="flex-1">
                <div className="h-2.5 bg-gray-600 rounded w-32 mb-1.5" />
                <div className="h-2 bg-gray-700 rounded w-20" />
              </div>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-gray-500 bg-gray-800/50 rounded-xl py-3 px-4">
          Connect your wallet to check if you qualify
        </div>
      </div>
    );
  }

  // ── Connected but insufficient balance ─────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="bg-gray-900 border border-purple-800 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="text-2xl mt-0.5">🔒</span>
          <div>
            <h3 className="text-sm font-bold text-white">Exclusive Content Locked</h3>
            <p className="text-xs text-gray-400 mt-1">
              You hold{" "}
              <span className="text-white font-semibold">{held.toLocaleString()} ${symbol}</span>
              {" — "}need{" "}
              <span className="text-purple-300 font-semibold">
                {config.threshold.toLocaleString()}
              </span>{" "}
              to unlock.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>{held.toLocaleString()} held</span>
            <span>{config.threshold.toLocaleString()} needed</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-700 to-purple-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, (held / config.threshold) * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="text-xs text-purple-400 mt-1.5 text-center">
            {needed.toLocaleString()} more ${symbol} to unlock
          </p>
        </div>

        {/* Blurred perk preview */}
        <div className="space-y-2 mb-5 pointer-events-none select-none">
          {config.perks.map((perk, i) => (
            <div
              key={i}
              className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3 blur-[3px]"
            >
              <span className="text-lg">{perkIcon(perk.type)}</span>
              <div className="flex-1">
                <div className="h-2.5 bg-gray-600 rounded w-32 mb-1.5" />
                <div className="h-2 bg-gray-700 rounded w-20" />
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-600 text-center">
          Buy more ${symbol} using the trade panel below ↓
        </p>
      </div>
    );
  }

  // ── Unlocked! ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-green-700 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-5">
        <span className="text-2xl mt-0.5">🔓</span>
        <div>
          <h3 className="text-sm font-bold text-green-400">Access Unlocked</h3>
          <p className="text-xs text-gray-400 mt-1">
            You hold{" "}
            <span className="text-green-300 font-semibold">
              {held.toLocaleString()} ${symbol}
            </span>{" "}
            — exclusive content below.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {config.perks.map((perk, i) => (
          <PerkItem key={i} perk={perk} />
        ))}
      </div>
    </div>
  );
}
