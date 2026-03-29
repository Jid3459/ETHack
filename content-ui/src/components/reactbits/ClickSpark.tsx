import { useEffect, useRef, useState, ReactNode } from 'react'

interface Spark {
  id: number
  x: number
  y: number
  angle: number
}

interface ClickSparkProps {
  children: ReactNode
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
}

export default function ClickSpark({
  children,
  sparkColor = '#3b82f6',
  sparkSize = 8,
  sparkRadius = 14,
  sparkCount = 6,
  duration = 350,
}: ClickSparkProps) {
  const [sparks, setSparks] = useState<Spark[]>([])
  const counterRef = useRef(0)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newSparks: Spark[] = []
    for (let i = 0; i < sparkCount; i++) {
      newSparks.push({
        id: counterRef.current++,
        x: e.clientX,
        y: e.clientY,
        angle: (360 / sparkCount) * i,
      })
    }
    setSparks(prev => [...prev, ...newSparks])
    setTimeout(() => {
      setSparks(prev => prev.filter(s => !newSparks.find(n => n.id === s.id)))
    }, duration)
  }

  return (
    <div onClick={handleClick} style={{ position: 'relative' }}>
      {children}
      {sparks.map(spark => (
        <SparkParticle
          key={spark.id}
          x={spark.x}
          y={spark.y}
          angle={spark.angle}
          color={sparkColor}
          size={sparkSize}
          radius={sparkRadius}
          duration={duration}
        />
      ))}
    </div>
  )
}

interface SparkParticleProps {
  x: number
  y: number
  angle: number
  color: string
  size: number
  radius: number
  duration: number
}

function SparkParticle({ x, y, angle, color, size, radius, duration }: SparkParticleProps) {
  const rad = (angle * Math.PI) / 180
  const tx = Math.cos(rad) * radius
  const ty = Math.sin(rad) * radius

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-50%, -50%)',
        animation: `spark-move ${duration}ms ease-out forwards`,
        ['--tx' as string]: `${tx}px`,
        ['--ty' as string]: `${ty}px`,
      }}
    />
  )
}

// Inject keyframes once
const style = document.createElement('style')
style.textContent = `
  @keyframes spark-move {
    0%   { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(0.3); }
  }
`
if (!document.head.querySelector('[data-clickspark]')) {
  style.setAttribute('data-clickspark', 'true')
  document.head.appendChild(style)
}