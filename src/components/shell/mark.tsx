/** The RIPPLE mark: three concentric arcs, the middle one turned. Same geometry as public/brand/mark.svg; colour follows the theme. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="none" stroke="var(--inflow)" strokeWidth={5} strokeLinecap="round">
        <path d="M37.42 32.96A5.5 5.5 0 1 1 31.04 26.58" />
        <path d="M34.43 45.79A14 14 0 1 1 45.16 27.21" />
        <path d="M54.16 35.91A22.5 22.5 0 1 1 28.09 9.84" />
      </g>
    </svg>
  );
}
