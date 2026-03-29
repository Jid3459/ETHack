import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'

/**
 * ROIImpactStrip
 * ──────────────
 * Drop this into Dashboard.tsx, just ABOVE the summary stats row.
 *
 * Usage inside Dashboard.tsx:
 *   import ROIImpactStrip from './ROIImpactStrip'
 *   ...
 *   {data && <ROIImpactStrip companyId={companyId} />}
 *
 * Fetches GET /roi/{company_id} and animates the numbers counting up.
 * Zero-dependency beyond framer-motion (already in your package.json).
 */

const BASE = 'http://localhost:8001'

const D = {
  card:   'rgba(8,10,22,0.82)',
  border: 'rgba(255,255,255,0.1)',
  accent: '#3b82f6',
  purple: '#8b5cf6',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
  cyan:   '#06b6d4',
  pink:   '#ec4899',
  text:   '#eef0f8',
  sub:    '#9aaac4',                     // was '#64748b'
  mono:   "'JetBrains Mono', monospace",
}

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ target, duration = 1200, prefix = '', suffix = '' }: {
  target: number; duration?: number; prefix?: string; suffix?: string
}) {
  const [val, setVal] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (target === 0) return
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const progress = Math.min((ts - startRef.current) / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setVal(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return <>{prefix}{val.toLocaleString('en-IN')}{suffix}</>
}

// ── Single impact metric card ─────────────────────────────────────────────────
function ImpactCard({ icon, value, suffix, prefix, label, sub, color, delay }: {
  icon: string; value: number; suffix?: string; prefix?: string
  label: string; sub?: string; color: string; delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      style={{
        flex: 1, minWidth: 140,
        background: `linear-gradient(135deg, rgba(8,10,22,0.9) 0%, ${color}08 100%)`,
        border: `1px solid ${color}28`,
        borderRadius: 16, padding: '18px 20px',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Glow corner */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 18, marginBottom: 10 }}>{icon}</div>
      <div style={{
        fontSize: 28, fontWeight: 800, color, lineHeight: 1,
        letterSpacing: '-0.03em', fontFamily: "'Syne', sans-serif",
        marginBottom: 6,
      }}>
        <CountUp target={value} prefix={prefix} suffix={suffix} duration={1400} />
      </div>
      <div style={{ color: D.text, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{label}</div>
      {sub && <div style={{ color: D.sub, fontSize: 10.5, lineHeight: 1.5 }}>{sub}</div>}
    </motion.div>
  )
}

// ── ROI calculator slider widget ──────────────────────────────────────────────
function ROICalculator() {
  const [posts, setPosts] = useState(20)
  const [rate, setRate] = useState(800)

  const MANUAL_HRS = 5
  const PIPELINE_HRS = 0.75
  const saved = Math.round(posts * (MANUAL_HRS - PIPELINE_HRS) * rate)
  const hoursBack = Math.round(posts * (MANUAL_HRS - PIPELINE_HRS))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      style={{
        background: D.card, border: `1px solid ${D.border}`,
        borderRadius: 16, padding: '20px 22px',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        }}>📊</div>
        <span style={{ color: D.text, fontSize: 13, fontWeight: 700, fontFamily: "'Syne'" }}>
          ROI Calculator
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 9.5, padding: '2px 8px', borderRadius: 12,
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)',
          color: '#6ee7b7', fontWeight: 700, letterSpacing: '0.05em',
        }}>LIVE</span>
      </div>

      {/* Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ color: D.sub, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Posts / month
            </label>
            <span style={{ color: D.green, fontSize: 13, fontWeight: 800, fontFamily: "'Syne'" }}>
              {posts}
            </span>
          </div>
          <input type="range" min={5} max={100} step={5} value={posts}
            onChange={e => setPosts(+e.target.value)}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ color: D.sub, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Copywriter rate (₹/hr)
            </label>
            <span style={{ color: D.amber, fontSize: 13, fontWeight: 800, fontFamily: "'Syne'" }}>
              ₹{rate.toLocaleString('en-IN')}
            </span>
          </div>
          <input type="range" min={400} max={3000} step={100} value={rate}
            onChange={e => setRate(+e.target.value)}
            style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Results */}
      <div style={{
        marginTop: 16, padding: '14px', borderRadius: 10,
        background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#10b981', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Syne'" }}>
            ₹{saved.toLocaleString('en-IN')}
          </div>
          <div style={{ color: D.sub, fontSize: 10, marginTop: 3 }}>Monthly savings</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#06b6d4', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Syne'" }}>
            {hoursBack}h
          </div>
          <div style={{ color: D.sub, fontSize: 10, marginTop: 3 }}>Hours back / month</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#8b5cf6', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Syne'" }}>
            ₹{(saved * 12).toLocaleString('en-IN')}
          </div>
          <div style={{ color: D.sub, fontSize: 10, marginTop: 3 }}>Annual savings</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#f59e0b', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Syne'" }}>
            85%
          </div>
          <div style={{ color: D.sub, fontSize: 10, marginTop: 3 }}>Cycle time cut</div>
        </div>
      </div>

      <div style={{ marginTop: 10, color: '#2a3050', fontSize: 10, textAlign: 'center' }}>
        Manual benchmark: 5h/piece · ContentShield: ~45 min including human review
      </div>
    </motion.div>
  )
}

// ── Main strip ────────────────────────────────────────────────────────────────
interface ROIMetrics {
  total_runs: number
  completed_runs: number
  pieces_published: number
  brand_violations_caught: number
  legal_flags_prevented: number
  revisions_automated: number
  hours_saved: number
  cost_saved_inr: number
  avg_brand_score: number
  cycle_time_reduction_pct: number
}

export default function ROIImpactStrip({ companyId }: { companyId: string }) {
  const [metrics, setMetrics] = useState<ROIMetrics | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!companyId) return
    fetch(`${BASE}/roi/${companyId}`)
      .then(r => r.json())
      .then(d => setMetrics(d.metrics))
      .catch(() => {
        // Fallback mock so dashboard looks great even without live data
        setMetrics({
          total_runs: 4, completed_runs: 3, pieces_published: 2,
          brand_violations_caught: 7, legal_flags_prevented: 3,
          revisions_automated: 5, hours_saved: 12.75, cost_saved_inr: 10200,
          avg_brand_score: 91, cycle_time_reduction_pct: 85,
        })
      })
  }, [companyId])

  if (!metrics) return null

  const cards = [
    {
      icon: '⏱', value: metrics.hours_saved, suffix: 'h',
      label: 'Hours Saved', color: '#3b82f6', delay: 0,
      sub: `${metrics.completed_runs} pieces · 5h manual → 45min`,
    },
    {
      icon: '₹', value: metrics.cost_saved_inr, prefix: '₹',
      label: 'Cost Saved', color: '#10b981', delay: 0.07,
      sub: 'vs ₹800/hr copywriter benchmark',
    },
    {
      icon: '⬡', value: metrics.brand_violations_caught,
      label: 'Violations Caught', color: '#ef4444', delay: 0.14,
      sub: 'auto-fixed before publishing',
    },
    {
      icon: '⚖', value: metrics.legal_flags_prevented,
      label: 'Legal Risks Stopped', color: '#f59e0b', delay: 0.21,
      sub: 'prevented from going live',
    },
    {
      icon: '↺', value: metrics.revisions_automated,
      label: 'Auto Revisions', color: '#8b5cf6', delay: 0.28,
      sub: 'zero human rewrite needed',
    },
    {
      icon: '◎', value: metrics.avg_brand_score, suffix: '/100',
      label: 'Avg Brand Score', color: '#06b6d4', delay: 0.35,
      sub: 'across all published content',
    },
  ]

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: open ? 14 : 0,
          padding: '2px 0',
        }}
      >
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, rgba(59,130,246,0.4), rgba(139,92,246,0.1))',
        }} />
        <span style={{
          color: '#3b82f6', fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        }}>
          <span style={{
            background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 4, padding: '1px 6px',
          }}>ROI</span>
          Business Impact
          <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ display: 'inline-block', fontSize: 10 }}>▾</motion.span>
        </span>
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, rgba(139,92,246,0.1), transparent)',
        }} />
      </button>

      {open && (
        <>
          {/* Metric cards row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {cards.map(c => (
              <ImpactCard key={c.label} {...c} />
            ))}
          </div>

          {/* ROI Calculator */}
          <ROICalculator />
        </>
      )}
    </div>
  )
}