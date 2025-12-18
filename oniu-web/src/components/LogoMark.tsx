type Props = {
  className?: string
  animated?: boolean
}

export default function LogoMark({ className, animated = false }: Props) {
  const rawId = (globalThis.crypto?.randomUUID?.() ?? `oniu-${Date.now()}-${Math.random().toString(16).slice(2)}`).replaceAll(':', '')
  const gradId = `${rawId}-grad`
  const sheenId = `${rawId}-sheen`
  const glowId = `${rawId}-glow`
  const baseD =
    'M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z'
  const pinchD =
    'M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 50 31.5 46 32C50 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 14 32.5 18 32C14 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z'

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="10" x2="56" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A5B4FC" />
          <stop offset="0.5" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#A7F3D0" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,0.0)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="0.65" stopColor="rgba(255,255,255,0.0)" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 0.55 0"
          />
        </filter>
      </defs>

      <g className={animated ? 'oniu-logo-hue' : undefined}>
        <path d={baseD} fill={`url(#${gradId})`}>
          {animated ? (
            <animate
              attributeName="d"
              dur="4.2s"
              repeatCount="indefinite"
              values={`${baseD};${baseD};${pinchD};${baseD};${baseD}`}
              keyTimes="0;0.70;0.76;0.82;1"
              calcMode="spline"
              keySplines="0.2 0.8 0.2 1; 0.2 0.8 0.2 1; 0.2 0.8 0.2 1; 0.2 0.8 0.2 1"
            />
          ) : null}
        </path>
        <path d={baseD} fill={`url(#${sheenId})`} opacity={0.7} />
        <path d={baseD} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth={1} />
        <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="rgba(0,0,0,0.26)" />
        <rect x="17" y="29.5" width="30" height="5" rx="2.5" fill="rgba(255,255,255,0.34)" />
        <path d={baseD} fill="none" filter={animated ? `url(#${glowId})` : undefined} opacity={animated ? 0.55 : 0} />
      </g>
    </svg>
  )
}


