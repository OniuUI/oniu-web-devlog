import { useEffect, useRef } from 'react'

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
}

export default function ThreeBackground() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    if (prefersReducedMotion()) {
      // Keep it subtle for accessibility.
      return
    }

    let cancelled = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      const THREE = await import('three')
      if (cancelled) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
      camera.position.z = 6

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      host.appendChild(renderer.domElement)

      const group = new THREE.Group()
      scene.add(group)

      // Soft lights
      const key = new THREE.PointLight(0x93c5fd, 1.2, 25) // sky-300-ish
      key.position.set(3, 2, 6)
      scene.add(key)

      const fill = new THREE.PointLight(0xa7f3d0, 0.8, 25) // emerald-200-ish
      fill.position.set(-3, -2, 6)
      scene.add(fill)

      const ambient = new THREE.AmbientLight(0xffffff, 0.25)
      scene.add(ambient)

      // Particle field (Points)
      const count = 850
      const positions = new Float32Array(count * 3)
      const speeds = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        positions[i3 + 0] = (Math.random() - 0.5) * 14
        positions[i3 + 1] = (Math.random() - 0.5) * 9
        positions[i3 + 2] = (Math.random() - 0.5) * 6
        speeds[i] = 0.2 + Math.random() * 0.8
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.02,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })

      const points = new THREE.Points(geo, mat)
      group.add(points)

      // A subtle “glass” orb to catch animated lights
      const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.2, 3),
        new THREE.MeshPhysicalMaterial({
          color: 0x0b1220,
          metalness: 0.1,
          roughness: 0.25,
          transmission: 0.75,
          thickness: 0.8,
          ior: 1.35,
          transparent: true,
          opacity: 0.35,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
        }),
      )
      orb.position.set(0, 0.2, -0.6)
      group.add(orb)

      let raf = 0
      let start = performance.now()

      const resize = () => {
        const rect = host.getBoundingClientRect()
        const w = Math.max(1, Math.floor(rect.width))
        const h = Math.max(1, Math.floor(rect.height))
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }

      const ro = new ResizeObserver(resize)
      ro.observe(host)
      resize()

      const tick = (now: number) => {
        const t = (now - start) / 1000

        // Animate lights around the scene for a “living” gradient feel.
        key.position.x = Math.cos(t * 0.35) * 3.2
        key.position.y = 1.8 + Math.sin(t * 0.5) * 0.8
        fill.position.x = Math.cos(t * 0.33 + 2.0) * -3.0
        fill.position.y = -1.8 + Math.sin(t * 0.45 + 1.5) * 0.7

        // Float particles upward, wrap around
        const pos = geo.getAttribute('position') as import('three').BufferAttribute
        for (let i = 0; i < count; i++) {
          const yIndex = i * 3 + 1
          pos.array[yIndex] += 0.0025 * speeds[i]
          if (pos.array[yIndex] > 4.8) pos.array[yIndex] = -4.8
        }
        pos.needsUpdate = true

        group.rotation.y = t * 0.06
        group.rotation.x = Math.sin(t * 0.15) * 0.05
        orb.rotation.y = t * 0.12
        orb.rotation.x = t * 0.08

        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }

      raf = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        try {
          host.removeChild(renderer.domElement)
        } catch {
          // ignore
        }
        geo.dispose()
        mat.dispose()
        ;(orb.material as import('three').Material).dispose()
        ;(orb.geometry as import('three').BufferGeometry).dispose()
        renderer.dispose()
      }
    })().catch(() => {
      // ignore failures
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return <div ref={hostRef} className="absolute inset-0" />
}



