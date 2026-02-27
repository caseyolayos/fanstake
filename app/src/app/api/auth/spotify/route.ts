import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? "https://fanstake.app/api/auth/spotify/callback";

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint");
  if (!mint) return NextResponse.json({ error: "Missing mint" }, { status: 400 });
  if (!CLIENT_ID) return NextResponse.json({ error: "Spotify not configured" }, { status: 503 });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: "user-read-private",
    state: mint, // pass mint through OAuth state param
    show_dialog: "true",
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
