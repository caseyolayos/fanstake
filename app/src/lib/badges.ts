/**
 * FanStake Holder Badge System
 *
 * Badges are computed client-side from on-chain data:
 *   - holderRank: position in sorted holders list (1 = top)
 *   - holderCount: total number of wallets holding
 *   - hasSold: whether this wallet has any sell transactions
 *   - firstBuyTimestamp: unix seconds of first buy
 *   - solSpent: total SOL spent buying (determines Backstage tier)
 */

export interface BadgeInfo {
  emoji: string;
  label: string;
  description: string;
  tier: number; // higher = rarer / more prestigious
  color: string; // tailwind text color
  bg: string;   // tailwind bg color
  border: string; // tailwind border color
}

/**
 * Returns all earned badges for a wallet's position.
 * Multiple badges can be earned simultaneously.
 */
export function computeBadges({
  holderRank,        // 1-indexed position in sorted holder list
  solSpent,          // total SOL spent buying (raw SOL, not lamports)
  hasSold,           // true if any sell tx exists for this wallet
  firstBuyTimestamp, // unix seconds; null if unknown
  nowTimestamp,      // unix seconds (pass Date.now()/1000)
}: {
  holderRank: number | null;
  solSpent: number;
  hasSold: boolean;
  firstBuyTimestamp: number | null;
  nowTimestamp: number;
}): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  // 💎 Diamond Hands — no sells for 30+ days (2,592,000 seconds)
  if (
    !hasSold &&
    firstBuyTimestamp !== null &&
    nowTimestamp - firstBuyTimestamp >= 30 * 24 * 3600
  ) {
    badges.push({
      emoji: "💎",
      label: "Diamond Hands",
      description: "Held for 30+ days without selling",
      tier: 4,
      color: "text-cyan-300",
      bg: "bg-cyan-950/40",
      border: "border-cyan-700/50",
    });
  }

  // 🥇 Founding Fan — top 10 holders
  if (holderRank !== null && holderRank <= 10) {
    badges.push({
      emoji: "🥇",
      label: "Founding Fan",
      description: "Top 10 holder",
      tier: 3,
      color: "text-yellow-300",
      bg: "bg-yellow-950/40",
      border: "border-yellow-600/50",
    });
  }
  // 🥈 Day One Holder — top 11–50 holders
  else if (holderRank !== null && holderRank <= 50) {
    badges.push({
      emoji: "🥈",
      label: "Day One Holder",
      description: "Top 50 holder",
      tier: 2,
      color: "text-gray-200",
      bg: "bg-gray-700/40",
      border: "border-gray-500/50",
    });
  }
  // 🥉 Backstage Supporter — spent 0.01+ SOL (and not already higher tier)
  else if (solSpent >= 0.01) {
    badges.push({
      emoji: "🥉",
      label: "Backstage Supporter",
      description: `Invested ${solSpent.toFixed(3)} SOL`,
      tier: 1,
      color: "text-amber-400",
      bg: "bg-amber-950/30",
      border: "border-amber-700/40",
    });
  }

  // Sort by tier descending (most prestigious first)
  return badges.sort((a, b) => b.tier - a.tier);
}

/**
 * Returns the single "best" badge for compact display (leaderboard rows, etc.)
 */
export function topBadge(badges: BadgeInfo[]): BadgeInfo | null {
  return badges.length > 0 ? badges[0] : null;
}

/**
 * Build the share tweet text incorporating the best badge.
 */
export function buildShareTweet({
  badge,
  symbol,
  tokensReceived,
  holderRank,
  url,
}: {
  badge: BadgeInfo | null;
  symbol: string;
  tokensReceived: string;
  holderRank: number | null;
  url: string;
}): string {
  const badgeLine = badge ? `\n${badge.emoji} ${badge.label}` : "";
  const rankLine = holderRank ? `\nfan #${holderRank} 🔥` : "";
  return `just copped ${tokensReceived} $${symbol} tokens on @FanStakeMusic${badgeLine}${rankLine}\n\nif they blow up, i win with them 🚀\n\n${url}`;
}
