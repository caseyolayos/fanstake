import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI ?? "https://fanstake.app/api/auth/spotify/callback";
const SIGNING_SECRET = process.env.SPOTIFY_SIGNING_SECRET ?? "fanstake-dev-secret-change-me";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://fanstake.app";

export interface SpotifyVerificationPayload {
  mint: string;
  spotifyId: string;
  displayName: string;
  followers: number;
  imageUrl: string | null;
  ts: number; // unix ms — expires after 10 minutes
}

export function signPayload(payload: SpotifyVerificationPayload): string {
  return createHmac("sha256", SIGNING_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function verifyPayloadSig(payload: SpotifyVerificationPayload, sig: string): boolean {
  const expected = signPayload(payload);
  // Constant-time compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state"); // mint address
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(`${BASE_URL}?spotify_error=${error ?? "cancelled"}`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const { access_token } = await tokenRes.json();

    // Fetch user profile
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
    const profile = await profileRes.json();

    const payload: SpotifyVerificationPayload = {
      mint: state,
      spotifyId: profile.id,
      displayName: profile.display_name ?? profile.id,
      followers: profile.followers?.total ?? 0,
      imageUrl: profile.images?.[0]?.url ?? null,
      ts: Date.now(),
    };

    const sig = signPayload(payload);
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

    // Redirect back to the artist page with the signed payload
    return NextResponse.redirect(
      `${BASE_URL}/artist/${state}?sv=${encoded}&ss=${sig}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_error";
    return NextResponse.redirect(`${BASE_URL}/artist/${state}?spotify_error=${encodeURIComponent(msg)}`);
  }
}
