import type { CSSProperties } from 'react'

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ')
}

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-xl bg-white/5 ring-1 ring-white/10',
        className,
      )}
      style={style}
    />
  )
}

export function SkeletonLine({ w = '100%', className }: { w?: string; className?: string }) {
  return <Skeleton className={cx('h-3', className)} style={{ width: w }} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-neutral-950/30 p-5 ring-1 ring-white/10">
      <Skeleton className="h-4 w-1/2" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}


