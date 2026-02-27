"use client";

import { createPortal } from "react-dom";
import { useState, useRef } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { useWallet, useConnection } from "./WalletProvider";

const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

interface EditProfileModalProps {
  mint: string;
  program: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  bondingCurvePDA: PublicKey;
  current: {
    name: string;
    symbol: string;
    image: string | null;
    description: string | null;
    spotify: string | null;
    soundcloud: string | null;
    audius: string | null;
    instagram: string | null;
    twitter: string | null;
    lastEditedAt: number | null; // unix ms
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function EditProfileModal({
  mint,
  program,
  bondingCurvePDA,
  current,
  onClose,
  onSuccess,
}: EditProfileModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [bio, setBio]               = useState(current.description ?? "");
  const [spotify, setSpotify]       = useState(current.spotify ?? "");
  const [soundcloud, setSoundcloud] = useState(current.soundcloud ?? "");
  const [audius, setAudius]         = useState(current.audius ?? "");
  const [instagram, setInstagram]   = useState(current.instagram ?? "");
  const [twitter, setTwitter]       = useState(current.twitter ?? "");

  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(current.image);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 30-day cooldown check
  const lastEdit = current.lastEditedAt;
  const now = Date.now();
  const cooldownRemaining = lastEdit ? Math.max(0, lastEdit + COOLDOWN_MS - now) : 0;
  const onCooldown = cooldownRemaining > 0;
  const cooldownDays = Math.ceil(cooldownRemaining / (24 * 60 * 60 * 1000));

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const compressImage = (file: File): Promise<Blob> =>
    new Promise((resolve) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height / width) * MAX); width = MAX; }
          else { width = Math.round((width / height) * MAX); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });

  const handleSave = async () => {
    if (!publicKey || !signTransaction || onCooldown) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Upload new image if changed
      let imageUrl = current.image ?? "";
      if (newImageFile) {
        const compressed = await compressImage(newImageFile);
        const fd = new FormData();
        fd.append("image", compressed, "artist.jpg");
        const res = await fetch("/api/upload-image", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error ?? "Image upload failed");
        imageUrl = data.url;
      }

      // 2. Build updated metadata JSON
      const metadata = {
        name: current.name,
        symbol: current.symbol,
        image: imageUrl,
        description: bio.trim() || null,
        properties: {
          links: {
            spotify:    spotify.trim()    || null,
            soundcloud: soundcloud.trim() || null,
            audius:     audius.trim()     || null,
            instagram:  instagram.trim()  || null,
            twitter:    twitter.trim()    || null,
          },
          lastEditedAt: Date.now(),
        },
      };

      // 3. Upload metadata JSON to catbox.moe via our proxy
      // Route expects { json: "<stringified>" }
      const metaRes = await fetch("/api/upload-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: JSON.stringify(metadata) }),
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok || !metaData.url) throw new Error(metaData.error ?? "Metadata upload failed");
      const newUri: string = metaData.url;

      // 4. Call updateArtistToken on-chain
      const updateIx = await program.methods
        .updateArtistToken(newUri)
        .accounts({ bondingCurve: bondingCurvePDA, artist: publicKey })
        .instruction();

      const tx = new Transaction();
      tx.add(updateIx);
      // Use "finalized" blockhash — longer TTL (~2 min) so Phantom review time doesn't expire it
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      // skipPreflight: true — avoids local simulation blockhash-not-found false positives
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 3 });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      console.log("[EditProfile] Updated URI:", newUri, "sig:", sig);
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("User rejected")) setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-white font-bold text-lg">Edit Profile</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {onCooldown
                ? `⏳ Next edit available in ${cooldownDays} day${cooldownDays !== 1 ? "s" : ""}`
                : lastEdit
                ? "✏️ Profile updated — edit again anytime within the 30-day window"
                : "First edit is free — updates lock for 30 days after saving"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none ml-4">×</button>
        </div>

        {success ? (
          <div className="text-center py-12 px-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-white font-bold text-lg">Profile updated!</p>
            <p className="text-gray-400 text-sm mt-1">Your changes are live on-chain.</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Image */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2 block">Artist Photo</label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => !onCooldown && fileRef.current?.click()}
                  className={`w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 transition ${
                    onCooldown ? "border-gray-700 cursor-not-allowed opacity-50" : "border-gray-600 hover:border-purple-500 cursor-pointer"
                  }`}
                >
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  <p>Click to change your photo.</p>
                  <p className="mt-1">JPG or PNG, max 5MB.</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            </div>

            {/* Bio */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2 block">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={onCooldown}
                maxLength={280}
                rows={3}
                placeholder="Tell fans about your music, your story, what you're building..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              />
              <p className="text-xs text-gray-600 text-right mt-1">{bio.length}/280</p>
            </div>

            {/* Links */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3 block">Links</label>
              <div className="space-y-2">
                {[
                  { label: "🎧 Spotify URL",    value: spotify,    set: setSpotify,    placeholder: "https://open.spotify.com/artist/..." },
                  { label: "☁️ SoundCloud URL", value: soundcloud, set: setSoundcloud, placeholder: "https://soundcloud.com/..." },
                  { label: "🎵 Audius URL",      value: audius,     set: setAudius,     placeholder: "https://audius.co/..." },
                  { label: "📸 Instagram",       value: instagram,  set: setInstagram,  placeholder: "https://instagram.com/..." },
                  { label: "𝕏 Twitter/X",       value: twitter,    set: setTwitter,    placeholder: "https://x.com/..." },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label className="text-xs text-gray-600 mb-1 block">{label}</label>
                    <input
                      type="url"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      disabled={onCooldown}
                      placeholder={placeholder}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Cooldown warning */}
            {onCooldown && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-xl text-xs text-yellow-400">
                ⏳ Your profile was recently updated. You can edit again in <strong>{cooldownDays} day{cooldownDays !== 1 ? "s" : ""}</strong>.
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-xl text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pb-1">
              <button
                onClick={handleSave}
                disabled={loading || onCooldown || !publicKey}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition"
              >
                {loading ? "⏳ Saving..." : "Save Profile"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-xl text-sm transition"
              >
                Cancel
              </button>
            </div>

            {!onCooldown && (
              <p className="text-xs text-gray-600 text-center -mt-2">
                Saving locks your profile for 30 days. Choose your words carefully.
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
