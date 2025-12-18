import { SkeletonCard } from '@/components/Skeleton'

export default function ProjectsSkeleton() {
  return (
    <section className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="h-5 w-28 animate-pulse rounded-lg bg-white/5 ring-1 ring-white/10" />
          <div className="mt-3 h-3 w-44 animate-pulse rounded-lg bg-white/5 ring-1 ring-white/10" />
        </div>
        <div className="h-3 w-20 animate-pulse rounded-lg bg-white/5 ring-1 ring-white/10" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  )
}


