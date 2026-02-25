import { NextRequest, NextResponse } from "next/server";

const AUDIUS_API = "https://discoveryprovider.audius.co/v1";
const APP_NAME = "FanStake";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.includes("audius.co")) {
    return NextResponse.json({ error: "Invalid Audius URL" }, { status: 400 });
  }

  try {
    // Resolve any Audius URL → track/playlist/user data
    const resolveRes = await fetch(
      `${AUDIUS_API}/resolve?url=${encodeURIComponent(url)}&app_name=${APP_NAME}`,
      { next: { revalidate: 3600 } }
    );
    const resolved = await resolveRes.json();

    // Track → embeddable player
    if (resolved?.data?.id && resolved?.data?.track_cid !== undefined) {
      return NextResponse.json({
        type: "track",
        embedUrl: `https://audius.co/embed/track?id=${resolved.data.id}&flavor=compact`,
        title: resolved.data.title,
        artist: resolved.data.user?.name,
      });
    }

    // Playlist/album → embeddable player
    if (resolved?.data?.id && resolved?.data?.playlist_name !== undefined) {
      return NextResponse.json({
        type: "playlist",
        embedUrl: `https://audius.co/embed/playlist?id=${resolved.data.id}&flavor=compact`,
        title: resolved.data.playlist_name,
        artist: resolved.data.user?.name,
      });
    }

    // Artist profile → link card (no embed available for profiles)
    if (resolved?.data?.handle) {
      return NextResponse.json({
        type: "profile",
        profileUrl: `https://audius.co/${resolved.data.handle}`,
        name: resolved.data.name,
        handle: resolved.data.handle,
        followerCount: resolved.data.follower_count,
        coverPhoto: resolved.data.cover_photo?.["2000x"] ?? null,
      });
    }

    // Fallback — just return profile link
    return NextResponse.json({ type: "link", profileUrl: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
