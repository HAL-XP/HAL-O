export function Logo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path d="M26 16C20 16 16 20 16 26L16 78C16 82 18 84 22 84L74 84C74 84 78 84 78 80L78 22C78 22 78 16 72 16Z"
        fill="#1a1d2e" stroke="#8b7cf7" strokeWidth="2" />
      <path d="M26 16C26 16 30 16 30 22L30 80C30 84 26 84 22 84"
        stroke="#5b4fc7" strokeWidth="1.5" opacity="0.4" />
      <text x="54" y="58" textAnchor="middle" fontFamily="Georgia, serif" fontSize="32" fontWeight="700" fill="#8b7cf7">C</text>
      <line x1="40" y1="34" x2="68" y2="34" stroke="#5b4fc7" strokeWidth="1" opacity="0.3" />
      <line x1="40" y1="70" x2="68" y2="70" stroke="#5b4fc7" strokeWidth="1" opacity="0.3" />
      <circle cx="72" cy="22" r="3" fill="#4ade80" opacity="0.7" />
    </svg>
  )
}
