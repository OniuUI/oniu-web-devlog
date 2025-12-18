import { Skeleton, SkeletonCard, SkeletonLine } from '@/components/Skeleton'

export default function PublicationsSkeleton() {
  return (
    <section className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-5 w-36" />
          <div className="mt-3">
            <SkeletonLine w="260px" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="mt-6 grid gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  )
}


