import React from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Navbar from './components/layout/Navbar'
import ClickSpark from './components/reactbits/ClickSpark'

import LandingPage from './pages/LandingPage'
import Dashboard from './pages/DashBoard' 
import Onboarding from './pages/Onboarding'
import BriefInput from './pages/BriefInput'
import PipelineProgress from './pages/PipelineProgress'
import HumanApproval from './pages/HumanApproval'
import AuditLog from './pages/AuditLog'

// ─── Global Aurora Background ─────────────────────────────────────────────────
// Applied to ALL inner pages (not landing) for visual consistency
function GlobalBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let t = 0, animId: number
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const bands = [
      { y: 0.12, amp: 0.05, freq: 0.15, ph: 0.0, r: 30, g: 80, b: 200, h: 0.28 },
      { y: 0.45, amp: 0.07, freq: 0.20, ph: 2.1, r: 80, g: 40, b: 220, h: 0.26 },
      { y: 0.78, amp: 0.05, freq: 0.16, ph: 3.2, r: 50, g: 20, b: 200, h: 0.22 },
    ]
    const draw = () => {
      const w = canvas.width, h = canvas.height
      ctx.fillStyle = 'rgba(4,5,12,0.07)'
      ctx.fillRect(0, 0, w, h)
      bands.forEach(b => {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.3 + b.ph)
        const alpha = 0.025 + pulse * 0.018
        const cy = h * b.y + h * b.amp * Math.sin(t * b.freq + b.ph)
        const bh = h * b.h
        const grad = ctx.createLinearGradient(0, cy - bh/2, 0, cy + bh/2)
        grad.addColorStop(0, `rgba(${b.r},${b.g},${b.b},0)`)
        grad.addColorStop(0.5, `rgba(${b.r},${b.g},${b.b},${alpha})`)
        grad.addColorStop(1, `rgba(${b.r},${b.g},${b.b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, cy - bh/2, w, bh)
      })
      t += 0.008
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing page — no navbar, no global BG */}
          <Route path="/" element={<LandingPage />} />

          {/* App pages — consistent navbar + aurora BG */}
          <Route path="/*" element={
            <ClickSpark sparkColor="#3b82f6" sparkSize={7} sparkCount={5} duration={320}>
              {/* Global aurora background on all inner pages */}
              <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundColor: '#04050c', overflow: 'hidden' }}>
                <GlobalBackground />
                {/* Grid overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `
                    linear-gradient(rgba(59,130,246,0.022) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(59,130,246,0.022) 1px, transparent 1px)
                  `,
                  backgroundSize: '60px 60px',
                }} />
                {/* Top-left glow */}
                <div style={{
                  position: 'absolute', top: '-20%', left: '-10%',
                  width: 700, height: 700, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
                }} />
                {/* Bottom-right glow */}
                <div style={{
                  position: 'absolute', bottom: '-20%', right: '-10%',
                  width: 600, height: 600, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
                }} />
              </div>

              <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
                <Navbar />
                <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px 60px' }}>
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/onboard" element={<Onboarding />} />                    
                    <Route path="/brief" element={<BriefInput />} />
                    <Route path="/pipeline" element={<PipelineProgress />} />
                    <Route path="/approve" element={<HumanApproval />} />
                    <Route path="/audit" element={<AuditLog />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </main>
              </div>
            </ClickSpark>
          } />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}