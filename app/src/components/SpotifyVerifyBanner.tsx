"use client";

import { useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useWallet, useConnection } from "./WalletProvider";

interface SpotifyVerifyBannerProps {
  mint: string;
  encoded: string;       // base64url payload from ?sv=
  sig: string;           // HMAC sig from ?ss=
  currentMetaUrl: string; // current on-chain URI
  artistName: string;    // FanStake artist name for fuzzy match
  program: any;          // eslint-disable-line @typescript-eslint/no-explicit-any
  bondingCurvePDA: PublicKey;
  onVerified: () => void;
  onDismiss: () => void;
}

export function SpotifyVerifyBanner({
  mint,
  encoded,
  sig,
  currentMetaUrl,
  artistName,
  program,
  bondingCurvePDA,
  onVerified,
  onDismiss,
}: SpotifyVerifyBannerProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Decode display info from payload (no server round-trip needed for preview)
  let preview: { displayName: string; followers: number; imageUrl: string | null } | null = null;
  let nameMatchWarning = false;
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    preview = { displayName: p.displayName, followers: p.followers, imageUrl: p.imageUrl };
    // Client-side fuzzy match preview — same logic as server
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const a = normalize(artistName);
    const b = normalize(p.displayName);
    nameMatchWarning = a.length > 0 && b.length > 0 && !a.includes(b) && !b.includes(a);
  } catch { /* ignore */ }

  const handleConfirm = async () => {
    if (!publicKey || !signTransaction) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Server verifies HMAC, builds updated metadata, returns new URI
      const confirmRes = await fetch("/api/auth/spotify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encoded, sig, currentMetaUrl, artistName }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error ?? "Confirmation failed");

      const newUri: string = confirmData.newUri;

      // 2. Artist signs updateArtistToken on-chain — proves wallet owns the token
      // Get fresh blockhash HERE (after server round-trip) so it doesn't expire
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

      const updateIx = await program.methods
        .updateArtistToken(newUri)
        .accounts({ bondingCurve: bondingCurvePDA, artist: publicKey })
        .instruction();

      const tx = new Transaction();
      tx.add(updateIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const txSig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 3 });
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");

      onVerified();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("User rejected")) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-green-700/60 bg-green-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Spotify logo */}
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white font-black text-sm">
            ♫
          </div>
          <div className="min-w-0">
            <p className="text-green-400 font-bold text-sm flex items-center gap-1.5">
              ✓ Spotify Connected
            </p>
            {preview && (
              <p className="text-white text-sm font-medium truncate">
                {preview.displayName}
                {preview.followers > 0 && (
                  <span className="text-gray-400 font-normal ml-1.5 text-xs">
                    {preview.followers.toLocaleString()} followers
                  </span>
                )}
              </p>
            )}
            <p className="text-gray-400 text-xs mt-0.5">
              Confirm to write your Verified badge on-chain
            </p>
            {nameMatchWarning && (
              <p className="text-yellow-400 text-xs mt-1.5 flex items-center gap-1">
                ⚠️ Spotify name &ldquo;{preview?.displayName}&rdquo; doesn&apos;t match your artist name &ldquo;{artistName}&rdquo; — you can still verify, but the badge will show a mismatch warning.
              </p>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-gray-400 text-lg leading-none flex-shrink-0">×</button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleConfirm}
          disabled={loading || !publicKey}
          className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition"
        >
          {loading ? "⏳ Verifying..." : "✓ Confirm Verification"}
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-xl text-sm transition"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-600 text-center mt-2">
        This writes a one-time verified badge to your token — tiny Solana network fee only.
      </p>
    </div>
  );
}
