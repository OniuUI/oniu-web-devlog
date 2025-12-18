import { Skeleton, SkeletonCard, SkeletonLine } from '@/components/Skeleton'

export default function DeploymentsSkeleton() {
  return (
    <section className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <Skeleton className="h-5 w-36" />
          <div className="mt-3">
            <SkeletonLine w="280px" />
          </div>
        </div>
        <Skeleton className="h-3 w-10 rounded-lg" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  )
}


