/**
 * Verified artist mint addresses.
 * To verify an artist: confirm they tweeted their verification message,
 * add their mint here, and redeploy.
 *
 * Format: { mint: string, twitterHandle: string, verifiedAt: string }
 */
export const VERIFIED_MINTS: {
  mint: string;
  twitterHandle: string;
  verifiedAt: string;
  spotify?: string;
  soundcloud?: string;
  audius?: string;
}[] = [
  {
    mint: "HTr4e9eceUAGe73fsfxEYCDt39hbA3c5HBTUgr8vPCUs",
    twitterHandle: "caseyolayos",
    verifiedAt: "2026-02-22",
    spotify: "https://open.spotify.com/artist/3FJCbzoeiuaiv1vsIwln9X",
  },
  // TODO: hunthux (Hunter Whitfield) — bass music, ~5K IG @hunthux — launching this week
  // Uncomment and fill in mint address after he launches:
  // {
  //   mint: "FILL_IN_AFTER_LAUNCH",
  //   twitterHandle: "hunthux",
  //   verifiedAt: "2026-02-XX",
  //   spotify: "https://open.spotify.com/artist/35pQsEKxQhhaKnmIPhAi0Q",
  //   soundcloud: "https://soundcloud.com/hunt_hux",
  // },
];

export function isVerified(mint: string): boolean {
  return VERIFIED_MINTS.some((v) => v.mint === mint);
}

export function getVerifiedInfo(mint: string) {
  return VERIFIED_MINTS.find((v) => v.mint === mint) ?? null;
}
