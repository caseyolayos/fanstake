"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useWallet, useConnection } from "./WalletProvider";

const FEE_WALLET = "6GCUMDXVwqVZUuQCQxA8yXwTk3hyXdfdvu8RXFSRNb25";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const TIERS = [
  {
    id: "basic" as const,
    label: "🔥 Boost",
    price: 0.25,
    duration: "24 hours",
    perks: [
      "Pinned to top of homepage",
      "🔥 Featured badge on your card",
      "Priority in search results",
    ],
    border: "border-orange-600/60 hover:border-orange-400",
    bg: "bg-orange-950/30",
    badge: "bg-orange-600",
    cta: "bg-orange-600 hover:bg-orange-500",
  },
  {
    id: "prime" as const,
    label: "💎 Prime Boost",
    price: 0.5,
    duration: "48 hours",
    perks: [
      "Top slot on homepage (above Basic)",
      "💎 Prime badge + gold border",
      "Shoutout tweet from @FanStakeMusic",
      "Priority in search results",
    ],
    border: "border-yellow-500/60 hover:border-yellow-400",
    bg: "bg-yellow-950/30",
    badge: "bg-yellow-500",
    cta: "bg-yellow-500 hover:bg-yellow-400 text-black",
  },
];

interface BoostModalProps {
  mint: string;
  artistName: string;
  onClose: () => void;
}

export function BoostModal({ mint, artistName, onClose }: BoostModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [selected, setSelected] = useState<"basic" | "prime">("basic");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ tier: string; sig: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tier = TIERS.find(t => t.id === selected)!;

  const handleBoost = async () => {
    if (!publicKey || !signTransaction) return;
    setLoading(true);
    setError(null);
    try {
      const feeWallet = new PublicKey(FEE_WALLET);
      const memo = `fanstake-boost:${mint}:${selected}`;

      const tx = new Transaction();

      // SOL transfer to fee wallet
      tx.add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: feeWallet,
        lamports: Math.round(tier.price * LAMPORTS_PER_SOL),
      }));

      // Memo instruction (SPL Memo program)
      tx.add(new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: Buffer.from(memo, "utf-8"),
      }));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 3 });

      // Confirm in background
      connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
        .catch(console.error);

      setSuccess({ tier: tier.label, sig });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("User rejected")) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-bold text-lg">Boost {artistName}</h3>
            <p className="text-gray-500 text-xs">Get more eyes on your token</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {success ? (
          /* Success state */
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">🚀</div>
            <p className="text-white font-bold text-lg">{success.tier} activated!</p>
            <p className="text-gray-400 text-sm">Your token is now featured on the FanStake homepage.</p>
            {selected === "prime" && (
              <p className="text-yellow-400 text-sm">💎 We'll send a shoutout tweet shortly.</p>
            )}
            <a
              href={`https://explorer.solana.com/tx/${success.sig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-gray-600 hover:text-gray-400 transition mt-2"
            >
              View transaction ↗
            </a>
            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-medium text-sm transition"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Tier selection */}
            <div className="space-y-3 mb-5">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left rounded-xl border p-4 transition ${t.bg} ${t.border} ${selected === t.id ? "ring-2 ring-purple-500" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-bold text-sm">{t.label}</span>
                    <div className="text-right">
                      <span className="text-white font-bold">{t.price} SOL</span>
                      <span className="text-gray-500 text-xs ml-1">/ {t.duration}</span>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {t.perks.map((p) => (
                      <li key={p} className="text-gray-300 text-xs flex items-start gap-1.5">
                        <span className="text-green-400 mt-0.5">✓</span> {p}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleBoost}
              disabled={loading || !publicKey}
              className={`w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${tier.cta} text-white`}
            >
              {loading ? "⏳ Processing..." : `${tier.label} — ${tier.price} SOL`}
            </button>

            <p className="text-center text-xs text-gray-600 mt-3">
              Payment goes directly on-chain. Boost activates instantly after confirmation.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
