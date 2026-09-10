interface TierBadgeProps {
  tier: "free" | "registered" | "premium" | "desktop";
}

export default function TierBadge({ tier }: TierBadgeProps) {
  const styles = {
    free: "bg-zinc-800 text-gray-400",
    registered: "bg-blue-600",
    premium: "bg-gradient-to-r from-[#00ff9f] to-[#00cc7a] text-black font-medium",
    desktop: "bg-purple-600",
  };

  return (
    <span className={`inline-block px-3 py-1 text-xs rounded-full ${styles[tier]}`}>
      {tier.toUpperCase()}
    </span>
  );
}