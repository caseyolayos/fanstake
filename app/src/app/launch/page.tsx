"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Header } from "../../components/Header";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "../../components/WalletProvider";
import { WalletButton, WalletButtonCompact } from "../../components/WalletButton";
import { Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { useProgram, getBondingCurvePDA, getPlatformConfigPDA, getArtistVestingPDA } from "../../hooks/useProgram";

/** Resize image to max 800×800 at 85% quality before uploading */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
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
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadImage(file: File): Promise<{ url: string | null; error: string | null }> {
  try {
    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("image", compressed, "artist.jpg");
    const res = await fetch("/api/upload-image", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? `Upload failed (${res.status})` };
    return { url: data.url ?? null, error: null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export default function LaunchPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    genre: "",
    bio: "",
    spotify: "",
    soundcloud: "",
    audius: "",
    instagram: "",
    twitter: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [verifyStep, setVerifyStep] = useState<{ mint: string; twitterHandle: string } | null>(null);

  // ── Gating state ──────────────────────────────────────────────────────────
  const [gatingEnabled, setGatingEnabled] = useState(false);
  const [gatingThreshold, setGatingThreshold] = useState("1000");
  const [gatingPerks, setGatingPerks] = useState<
    Array<{ type: "link" | "text" | "discord" | "download"; title: string; url: string; content: string }>
  >([{ type: "discord", title: "VIP Discord Server", url: "", content: "" }]);

  const addPerk = () =>
    setGatingPerks((p) => [...p, { type: "link", title: "", url: "", content: "" }]);

  const removePerk = (i: number) =>
    setGatingPerks((p) => p.filter((_, idx) => idx !== i));

  const updatePerk = (i: number, field: string, value: string) =>
    setGatingPerks((p) => p.map((perk, idx) => idx === i ? { ...perk, [field]: value } : perk));
  // Fetch SOL balance whenever wallet connects
  useEffect(() => {
    if (!publicKey || !connection) return;
    connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL));
  }, [publicKey, connection]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!publicKey || !program) {
      setError("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    try {
      // Upload image if provided, otherwise use placeholder
      let imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&background=7c3aed&color=fff&size=400&bold=true`;
      if (imageFile) {
        setImageUploading(true);
        setImageUploadError(null);
        const { url: uploaded, error: uploadErr } = await uploadImage(imageFile);
        setImageUploading(false);
        if (uploaded) {
          imageUrl = uploaded;
          console.log("Image uploaded:", imageUrl);
        } else {
          const msg = uploadErr ?? "Upload failed — using placeholder";
          setImageUploadError(msg);
          console.error("Image upload error:", msg);
          // Don't abort — continue with placeholder so user doesn't lose their form
        }
      }

      // Build metadata JSON (Metaplex-compatible)
      // Build gating field if artist configured it
      const gatingField = gatingEnabled
        ? {
            threshold: parseFloat(gatingThreshold) || 1000,
            perks: gatingPerks
              .filter((p) => p.title.trim() && (p.url.trim() || p.content.trim()))
              .map((p) => ({
                type: p.type,
                title: p.title.trim(),
                ...(p.type === "text" ? { content: p.content.trim() } : { url: p.url.trim() }),
              })),
          }
        : undefined;

      const metadata = {
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        description: formData.bio || `${formData.name} artist token on FanStake`,
        image: imageUrl,
        external_url: `https://fanstake.app`,
        attributes: [
          { trait_type: "Genre", value: formData.genre || "Unknown" },
          { trait_type: "Platform", value: "FanStake" },
        ],
        properties: {
          links: {
            spotify: formData.spotify || null,
            soundcloud: formData.soundcloud || null,
            audius: formData.audius || null,
            instagram: formData.instagram || null,
            twitter: formData.twitter || null,
          },
        },
        ...(gatingField ? { gating: gatingField } : {}),
      };

      // Upload metadata JSON to catbox.moe so we have a real URL on-chain
      const metadataJson = JSON.stringify(metadata);
      let metadataUri = imageUrl; // fallback: use image URL if upload fails
      try {
        const metaRes = await fetch("/api/upload-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: metadataJson }),
        });
        const metaData = await metaRes.json();
        if (metaRes.ok && metaData.url) {
          metadataUri = metaData.url;
          console.log("Metadata uploaded:", metadataUri);
        } else {
          console.warn("Metadata upload failed, falling back to image URL:", metaData.error);
        }
      } catch (err) {
        console.warn("Metadata upload error, falling back to image URL:", err);
      }

      // Generate a new mint keypair
      const mintKeypair = Keypair.generate();

      // Derive PDAs
      const [bondingCurve] = getBondingCurvePDA(mintKeypair.publicKey);
      const [artistVesting] = getArtistVestingPDA(mintKeypair.publicKey);
      const [platformConfig] = getPlatformConfigPDA();

      // Derive artist ATA for receiving their 10% share
      const artistTokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        publicKey
      );

      // Call createArtistToken — store metadata JSON URL on-chain
      const tx = await program.methods
        .createArtistToken(
          formData.name,
          formData.symbol.toUpperCase(),
          metadataUri.slice(0, 200), // JSON URL from catbox.moe (or image URL fallback)
          1000 // 10% artist share (1000 bps)
        )
        .accounts({
          bondingCurve,
          platformConfig,
          mint: mintKeypair.publicKey,
          artist: publicKey,
          artistTokenAccount,
          artistVesting,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("Token created! tx:", tx);
      console.log("Metadata:", metadataUri.slice(0, 80) + "...");
      // Show verification step if artist provided Twitter handle, otherwise go straight to artist page
      if (formData.twitter.trim()) {
        setVerifyStep({ mint: mintKeypair.publicKey.toString(), twitterHandle: formData.twitter.trim().replace("@", "") });
      } else {
        router.push(`/artist/${mintKeypair.publicKey.toString()}`);
      }
    } catch (err: unknown) {
      console.error("Launch error:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Transaction failed: ${message}`);
    } finally {
      setLoading(false);
      setImageUploading(false);
    }
  };

  // Post-launch verification step
  if (verifyStep) {
    const tweetText = `Verifying my $${formData.symbol.toUpperCase() || "TOKEN"} token on @fanstakemusic\n\nMint: ${verifyStep.mint}\n\nfanstake.app/artist/${verifyStep.mint}`;
    const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <div className="text-5xl mb-6">🎉</div>
          <h2 className="text-2xl font-bold mb-2">Token Launched!</h2>
          <p className="text-gray-400 mb-8">One last step — verify you&apos;re the real artist.</p>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left mb-6">
            <p className="text-xs text-gray-500 uppercase mb-3">Step 1 — Tweet this from <span className="text-white">@{verifyStep.twitterHandle}</span></p>
            <div className="bg-gray-800 rounded-xl p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap break-all mb-4">
              {tweetText}
            </div>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 bg-black border border-gray-600 hover:border-white text-white font-medium py-3 rounded-xl transition"
            >
              𝕏 Tweet to verify
            </a>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left mb-6">
            <p className="text-xs text-gray-500 uppercase mb-2">Step 2 — Submit for review</p>
            <p className="text-sm text-gray-400">
              After tweeting, DM{" "}
              <a href="https://x.com/fanstakemusic" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                @fanstakemusic
              </a>{" "}
              with your tweet link. We&apos;ll verify and add your ✓ badge within 24 hours.
            </p>
          </div>

          <div className="flex gap-3">
            <a
              href={`/artist/${verifyStep.mint}`}
              className="flex-1 py-3 text-center bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl transition"
            >
              View My Token →
            </a>
            <button
              onClick={() => setVerifyStep(null)}
              className="px-4 py-3 border border-gray-700 text-gray-400 hover:text-white rounded-xl transition text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">Launch Your Token</h2>
          <p className="text-gray-400">
            Create your personal artist token on Solana in minutes. Your fans
            can invest in your career directly.
          </p>
        </div>

        {/* Wallet status bar — always visible */}
        <div className={`mb-8 p-4 rounded-xl border flex items-center justify-between gap-4 ${
          publicKey
            ? "bg-green-900/20 border-green-700"
            : "bg-yellow-900/20 border-yellow-700"
        }`}>
          <div className="flex items-center gap-3">
            <span className={`text-xl ${publicKey ? "" : "animate-pulse"}`}>
              {publicKey ? "✅" : "⚠️"}
            </span>
            <div>
              <p className={`font-semibold text-sm ${publicKey ? "text-green-300" : "text-yellow-300"}`}>
                {publicKey ? "Wallet connected" : "Wallet not connected"}
              </p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                {publicKey
                  ? `${publicKey.toString().slice(0, 6)}...${publicKey.toString().slice(-6)}`
                  : "Connect your wallet to launch a token"}
              </p>
              {publicKey && solBalance !== null && (
                <p className={`text-xs mt-1 font-medium ${solBalance < 0.05 ? "text-red-400" : "text-green-400"}`}>
                  {solBalance.toFixed(4)} SOL
                  {solBalance < 0.01 && " — needs more SOL"}
                </p>
              )}
            </div>
          </div>
          {!publicKey && <WalletButton />}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="flex flex-col items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <div
              onClick={handleImageClick}
              className="w-32 h-32 rounded-full bg-gray-900 border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-purple-500 transition overflow-hidden relative group"
            >
              {imagePreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Artist photo preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <p className="text-xs text-white">Change</p>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-2xl">📷</p>
                  <p className="text-xs text-gray-500 mt-1">Upload Photo</p>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-600">
              {imageUploading
                ? "⏳ Uploading image..."
                : imageFile
                ? imageFile.name
                : "Click to upload artist photo"}
            </p>
            {imageUploadError && (
              <p className="text-xs text-yellow-500 mt-1">{imageUploadError}</p>
            )}
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase mb-2 block">
                Artist / Token Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., DJ Pulse"
                maxLength={32}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase mb-2 block">
                Symbol *
              </label>
              <input
                type="text"
                name="symbol"
                value={formData.symbol}
                onChange={handleChange}
                placeholder="e.g., PULSE"
                maxLength={10}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white uppercase focus:border-purple-500 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Genre */}
          <div>
            <label className="text-xs text-gray-500 uppercase mb-2 block">
              Genre
            </label>
            <select
              name="genre"
              value={formData.genre}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition"
            >
              <option value="">Select genre...</option>
              <optgroup label="Hip-Hop & R&B">
                <option value="hiphop">Hip-Hop / Rap</option>
                <option value="rnb">R&B / Soul</option>
                <option value="trap">Trap</option>
                <option value="drill">Drill</option>
              </optgroup>
              <optgroup label="Pop & Indie">
                <option value="pop">Pop</option>
                <option value="indie">Indie / Alternative</option>
                <option value="indie-pop">Indie Pop</option>
                <option value="bedroom-pop">Bedroom Pop</option>
              </optgroup>
              <optgroup label="Rock & Metal">
                <option value="rock">Rock</option>
                <option value="punk">Punk</option>
                <option value="metal">Metal</option>
                <option value="emo">Emo / Post-Hardcore</option>
              </optgroup>
              <optgroup label="Electronic">
                <option value="house">House</option>
                <option value="techno">Techno</option>
                <option value="dnb">Drum & Bass</option>
                <option value="trance">Trance</option>
                <option value="dubstep">Dubstep</option>
                <option value="bass">Bass Music</option>
                <option value="ambient">Ambient</option>
                <option value="synthwave">Synthwave</option>
                <option value="lofi">Lo-Fi</option>
                <option value="edm">EDM</option>
              </optgroup>
              <optgroup label="Global & Traditional">
                <option value="afrobeats">Afrobeats / Afropop</option>
                <option value="latin">Latin</option>
                <option value="reggae">Reggae / Dancehall</option>
                <option value="jazz">Jazz</option>
                <option value="blues">Blues</option>
                <option value="country">Country</option>
                <option value="folk">Folk / Acoustic</option>
                <option value="classical">Classical</option>
                <option value="gospel">Gospel / Christian</option>
              </optgroup>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Bio */}
          <div>
            <label className="text-xs text-gray-500 uppercase mb-2 block">
              Bio
            </label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder="Tell your fans who you are and why they should invest in your journey..."
              rows={4}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition resize-none"
            />
          </div>

          {/* Social Links */}
          <div>
            <p className="text-xs text-gray-500 uppercase mb-3">
              Music &amp; Social Links
            </p>
            <div className="space-y-3">
              {[
                { name: "spotify", placeholder: "Spotify profile or track URL", icon: "🎧" },
                { name: "soundcloud", placeholder: "SoundCloud profile URL", icon: "☁️" },
                { name: "audius", placeholder: "Audius profile or track URL", icon: "◈" },
                { name: "instagram", placeholder: "Instagram handle", icon: "📸" },
                { name: "twitter", placeholder: "X (Twitter) handle", icon: "𝕏" },
              ].map((link) => (
                <div key={link.name} className="flex items-center gap-3">
                  <span className="text-lg w-8 text-center">{link.icon}</span>
                  <input
                    type="text"
                    name={link.name}
                    value={formData[link.name as keyof typeof formData]}
                    onChange={handleChange}
                    placeholder={link.placeholder}
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none transition"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Token-Gated Content ─────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-white">🔑 Token-Gated Content</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fans who hold enough tokens unlock exclusive content — Discord access, download links, secret messages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGatingEnabled(!gatingEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ml-4 ${
                  gatingEnabled ? "bg-purple-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    gatingEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {gatingEnabled && (
              <div className="mt-5 space-y-4 border-t border-gray-800 pt-5">
                {/* Threshold */}
                <div>
                  <label className="text-xs text-gray-500 uppercase mb-1.5 block">
                    Minimum tokens to unlock
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={gatingThreshold}
                      onChange={(e) => setGatingThreshold(e.target.value)}
                      placeholder="1000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white font-mono focus:border-purple-500 focus:outline-none transition"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                      {formData.symbol.toUpperCase() || "tokens"}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {["100", "500", "1000", "5000", "10000"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setGatingThreshold(v)}
                        className="text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition"
                      >
                        {parseInt(v).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Perks list */}
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-3">Perks to unlock</p>
                  <div className="space-y-3">
                    {gatingPerks.map((perk, i) => (
                      <div key={i} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={perk.type}
                            onChange={(e) => updatePerk(i, "type", e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none transition"
                          >
                            <option value="discord">💬 Discord Server</option>
                            <option value="link">🔗 Exclusive Link</option>
                            <option value="download">⬇️ Download</option>
                            <option value="text">💎 Secret Message</option>
                          </select>
                          {gatingPerks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePerk(i)}
                              className="ml-auto text-xs text-gray-600 hover:text-red-400 transition"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder={
                            perk.type === "discord" ? "Label (e.g. VIP Discord)" :
                            perk.type === "download" ? "Label (e.g. Stems Pack)" :
                            perk.type === "text" ? "Label (e.g. Secret message)" :
                            "Label"
                          }
                          value={perk.title}
                          onChange={(e) => updatePerk(i, "title", e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition"
                        />
                        {perk.type === "text" ? (
                          <textarea
                            placeholder="Secret content — only visible to holders..."
                            value={perk.content}
                            onChange={(e) => updatePerk(i, "content", e.target.value)}
                            rows={2}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition resize-none"
                          />
                        ) : (
                          <input
                            type="url"
                            placeholder={
                              perk.type === "discord" ? "https://discord.gg/your-server" :
                              perk.type === "download" ? "https://... (download link)" :
                              "https://..."
                            }
                            value={perk.url}
                            onChange={(e) => updatePerk(i, "url", e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-purple-500 focus:outline-none transition"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addPerk}
                    className="mt-3 text-xs text-purple-400 hover:text-purple-300 border border-purple-800 hover:border-purple-600 rounded-lg px-4 py-2 transition w-full"
                  >
                    + Add another perk
                  </button>
                </div>

                <p className="text-xs text-gray-600 bg-gray-800/50 rounded-lg p-3">
                  ⚠️ Content is stored in public metadata on catbox.moe — only include links/text you&apos;re okay with savvy users seeing in the JSON. For extra security, use password-protected links.
                </p>
              </div>
            )}
          </div>

          {/* Cost Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-bold mb-3">Launch Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Token supply</span>
                <span className="text-white">1,000,000,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Artist share</span>
                <span className="text-white">10%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bonding curve type</span>
                <span className="text-white">Constant product (x*y=k)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Platform fee</span>
                <span className="text-white">1% on trades</span>
              </div>
              <hr className="border-gray-800 my-3" />
              <div className="flex justify-between font-bold">
                <span className="text-gray-400">Launch cost</span>
                <span className="text-white">~0.01 SOL (rent)</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !publicKey || !program}
            className={`w-full font-bold py-4 rounded-xl transition text-lg ${
              !publicKey
                ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                : loading
                ? "bg-purple-800 text-white cursor-wait"
                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
            }`}
          >
            {!publicKey
              ? "🔌 Connect Wallet to Launch"
              : loading
              ? "⏳ Launching..."
              : "🚀 Launch My Token"}
          </button>

          <p className="text-xs text-gray-600 text-center">
            By launching, you agree to our Terms of Service. Your token will be
            created on Solana mainnet.
          </p>
        </form>
      </div>
    </div>
  );
}
