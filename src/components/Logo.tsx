/** Chessy's mark: a wedge of cheese with a rook-crenellated top edge. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {/* rind / top face */}
      <path d="M6 40 L56 22 L44 10 Z" fill="#ffdc6e" />
      {/* front face */}
      <path d="M6 40 L56 22 L56 50 Q56 54 52 54 L10 54 Q6 54 6 50 Z" fill="#f5c542" />
      {/* rook crenellations on the edge of the wedge */}
      <path d="M44 10 L44 5 L48 5 L48 8 L51 8 L51 5 L55 5 L55 12 Z" fill="#ffdc6e" />
      <path d="M6 40 L56 22" stroke="#c9971f" strokeWidth="2" strokeLinecap="round" />
      {/* holes */}
      <circle cx="19" cy="45" r="3.6" fill="#d39c1c" />
      <circle cx="35" cy="42" r="5" fill="#d39c1c" />
      <circle cx="48" cy="47" r="2.8" fill="#d39c1c" />
      <circle cx="27" cy="50.5" r="2" fill="#d39c1c" />
      <circle cx="46" cy="33" r="2.2" fill="#d39c1c" />
      <circle cx="40" cy="19" r="2.2" fill="#e8b63a" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Chess<span>y</span>
    </span>
  );
}
