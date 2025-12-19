import { useEffect, useRef, useState } from 'react'
import type { VideoChunk } from '@/lib/videoCdn'

type CdnVideoTileProps = {
  label: string
  chunks: VideoChunk[]
  videoRef: (el: HTMLVideoElement | null) => void
}

export default function CdnVideoTile({ label, chunks, videoRef }: CdnVideoTileProps) {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const [failedChunks, setFailedChunks] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLVideoElement | null>(null)
  const sortedChunksRef = useRef<typeof chunks>([])

  useEffect(() => {
    if (ref.current) {
      videoRef(ref.current)
    }
  }, [videoRef])

  useEffect(() => {
    if (chunks.length === 0) {
      setBuffering(true)
      sortedChunksRef.current = []
      return
    }

    const sorted = [...chunks].sort((a, b) => a.ts - b.ts)
    sortedChunksRef.current = sorted

    if (sorted.length > 0) {
      console.log(`[CdnVideoTile] ${label}: ${sorted.length} chunks ready`)
    }

    if (currentChunkIndex >= sorted.length) {
      setCurrentChunkIndex(0)
    }
  }, [chunks, label])

  useEffect(() => {
    const sorted = sortedChunksRef.current
    if (sorted.length === 0) {
      setBuffering(true)
      return
    }

    let currentIndex = currentChunkIndex
    if (currentIndex >= sorted.length) {
      currentIndex = 0
      setCurrentChunkIndex(0)
    }

    const chunk = sorted[currentIndex]
    if (!ref.current || !chunk) return

    if (failedChunks.has(chunk.id)) {
      const nextIndex = currentIndex + 1
      if (nextIndex < sorted.length) {
        setCurrentChunkIndex(nextIndex)
      } else {
        setCurrentChunkIndex(0)
      }
      return
    }

    const video = ref.current
    const url = `/cdn/video?src=${encodeURIComponent(chunk.url)}`
    
    if (video.src === url && video.readyState >= 2) {
      return
    }

    video.src = url
    setBuffering(true)

    const handleLoadedData = () => {
      setBuffering(false)
      void video.play().catch(() => {
        setBuffering(false)
      })
    }

    const handleEnded = () => {
      const nextIndex = currentIndex + 1
      if (nextIndex < sorted.length) {
        setCurrentChunkIndex(nextIndex)
      } else {
        setCurrentChunkIndex(0)
      }
    }

    const handleError = () => {
      setFailedChunks((prev) => new Set(prev).add(chunk.id))
      const nextIndex = currentIndex + 1
      if (nextIndex < sorted.length) {
        setCurrentChunkIndex(nextIndex)
      } else {
        setCurrentChunkIndex(0)
      }
    }

    video.addEventListener('loadeddata', handleLoadedData, { once: true })
    video.addEventListener('ended', handleEnded, { once: true })
    video.addEventListener('error', handleError, { once: true })

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
    }
  }, [currentChunkIndex, failedChunks, chunks])

  if (chunks.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
        <div className="px-3 py-2 text-xs font-semibold text-neutral-200">{label}</div>
        <div className="aspect-video bg-black relative flex items-center justify-center">
          <div className="text-xs text-neutral-400">Waiting for video...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200 flex items-center justify-between">
        <span>{label}</span>
        {buffering ? (
          <span className="text-[10px] text-neutral-400">Buffering...</span>
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
        )}
      </div>
      <div className="aspect-video bg-black relative">
        <video ref={ref} playsInline autoPlay className="h-full w-full object-cover" />
        {buffering ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-8 w-8 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin"></div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
