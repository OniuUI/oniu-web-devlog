import { useEffect, useRef } from 'react'

type VideoTileProps = {
  label: string
  stream: MediaStream | null
  muted?: boolean
}

export default function VideoTile({ label, stream, muted }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!stream) {
      ref.current.srcObject = null
      return
    }
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream])

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200">{label}</div>
      <div className="aspect-video bg-black">
        <video ref={ref} muted={muted} playsInline autoPlay className="h-full w-full object-cover" />
      </div>
    </div>
  )
}
