export default function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Professional, subtle palette */}
      <div className="oniu-animate-hue absolute -top-24 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="oniu-animate-hue absolute top-40 left-1/3 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl [animation-delay:-2.5s]" />
      <div className="oniu-animate-hue absolute -bottom-28 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl [animation-delay:-5s]" />
    </div>
  )
}


