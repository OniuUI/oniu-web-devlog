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
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (ref.current) {
      videoRef(ref.current)
    }
  }, [videoRef])

  useEffect(() => {
    if (chunks.length === 0) {
      setBuffering(true)
      return
    }

    const playChunk = async (index: number) => {
      if (index >= chunks.length) {
        setCurrentChunkIndex(0)
        return
      }

      const chunk = chunks[index]
      if (!ref.current) return

      const video = ref.current
      video.src = `/cdn/video?src=${encodeURIComponent(chunk.url)}`
      setBuffering(true)

      video.onloadeddata = () => {
        setBuffering(false)
        void video.play().catch(() => {})
      }

      video.onended = () => {
        if (index < chunks.length - 1) {
          setCurrentChunkIndex(index + 1)
        } else {
          setCurrentChunkIndex(0)
        }
      }

      video.onerror = () => {
        if (index < chunks.length - 1) {
          setCurrentChunkIndex(index + 1)
        }
      }
    }

    void playChunk(currentChunkIndex)
  }, [chunks, currentChunkIndex])

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
