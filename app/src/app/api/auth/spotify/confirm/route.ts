import { NextRequest, NextResponse } from "next/server";
import { verifyPayloadSig, type SpotifyVerificationPayload } from "../callback/route";

const TEN_MINUTES = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { encoded, sig, currentMetaUrl, artistName } = await req.json();
    if (!encoded || !sig) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    // Decode + verify HMAC
    let payload: SpotifyVerificationPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!verifyPayloadSig(payload, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // Check expiry — 10 min window
    if (Date.now() - payload.ts > TEN_MINUTES) {
      return NextResponse.json({ error: "Verification expired — please try again" }, { status: 400 });
    }

    // Fetch existing metadata to merge (don't wipe existing fields)
    // Must use absolute URL — relative paths don't work in server-side API routes
    let existingMeta: Record<string, unknown> = {};
    if (currentMetaUrl?.startsWith("https://")) {
      try {
        const r = await fetch(currentMetaUrl);
        if (r.ok) existingMeta = await r.json();
      } catch { /* use empty */ }
    }

    // Fuzzy name match — normalize, check substring containment
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const a = normalize(artistName ?? "");
    const b = normalize(payload.displayName ?? "");
    const nameMatch = a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));

    // Build updated metadata with verified.spotify added
    const updatedMeta = {
      ...existingMeta,
      verified: {
        ...(existingMeta.verified as Record<string, unknown> ?? {}),
        spotify: {
          id: payload.spotifyId,
          displayName: payload.displayName,
          followers: payload.followers,
          imageUrl: payload.imageUrl,
          verifiedAt: new Date(payload.ts).toISOString(),
          nameMatch,  // true = names match, false = mismatch (warn-only)
        },
      },
    };

    // Upload updated metadata JSON
    const uploadRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://fanstake.app"}/api/upload-metadata`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: JSON.stringify(updatedMeta) }),
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.url) {
      return NextResponse.json({ error: uploadData.error ?? "Metadata upload failed" }, { status: 500 });
    }

    return NextResponse.json({
      newUri: uploadData.url,
      spotify: updatedMeta.verified,
      displayName: payload.displayName,
      followers: payload.followers,
      nameMatch,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
