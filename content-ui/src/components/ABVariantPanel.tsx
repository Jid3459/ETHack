/**
 * ABVariantPanel
 * ──────────────
 * Two files in one:
 *
 * 1. ABToggle  — drop into BriefInput.tsx ABOVE the submit button
 *    Shows a toggle switch. When on, submit button calls /run/variants
 *    instead of /run. Returns both run_ids; navigates to /pipeline.
 *
 * 2. ABResultCard — drop into Dashboard.tsx RunCard expanded section
 *    Shows side-by-side comparison of variant A vs B with winner badge.
 *
 * ── BriefInput.tsx integration ───────────────────────────────────────────────
 * import { ABToggle } from './ABVariantPanel'
 *
 * const [abMode, setAbMode] = useState(false)
 * const [abRunIds, setAbRunIds] = useState<{a: string, b: string} | null>(null)
 *
 * // Replace handleSubmit call with:
 * const handleSubmit = async () => {
 *   if (abMode) {
 *     const res = await fetch('http://localhost:8001/run/variants', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ company_id: companyId, brief, channel, content_type: contentType, target_languages: languages })
 *     }).then(r => r.json())
 *     setRunId(res.variant_a.run_id)  // track primary in context
 *     navigate('/pipeline')
 *   } else {
 *     // existing flow
 *   }
 * }
 *
 * // In JSX, above the submit button:
 * <ABToggle enabled={abMode} onToggle={setAbMode} />
 *
 * ── Dashboard.tsx integration ─────────────────────────────────────────────────
 * import { ABResultCard } from './ABVariantPanel'
 *
 * // Inside RunCard expanded section, if run has ab_group:
 * {run.ab_group && <ABResultCard abGroupId={run.ab_group} />}
 */

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const BASE = 'http://localhost:8001'

const D = {
  card:   'rgba(8,10,22,0.78)',
  border: 'rgba(255,255,255,0.1)',
  accent: '#3b82f6',
  purple: '#8b5cf6',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
  cyan:   '#06b6d4',
  text:   '#eef0f8',
  sub:    '#9aaac4',                     // was '#64748b'
  dim:    '#5a6a8a',                     // was '#2a3050'
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ABToggle — for BriefInput.tsx
// ─────────────────────────────────────────────────────────────────────────────

export function ABToggle({ enabled, onToggle }: {
  enabled: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <motion.div
      layout
      style={{
        background: enabled
          ? 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))'
          : D.card,
        border: `1px solid ${enabled ? 'rgba(139,92,246,0.35)' : D.border}`,
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'all 0.25s', cursor: 'pointer',
        backdropFilter: 'blur(10px)',
      }}
      onClick={() => onToggle(!enabled)}
    >
      {/* Toggle switch */}
      <div style={{
        width: 38, height: 20, borderRadius: 10, flexShrink: 0,
        background: enabled
          ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
          : 'rgba(255,255,255,0.1)',
        border: `1px solid ${enabled ? 'transparent' : D.border}`,
        position: 'relative', transition: 'all 0.25s',
      }}>
        <motion.div
          animate={{ x: enabled ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{
            position: 'absolute', top: 2,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: enabled ? D.text : D.sub, fontSize: 13, fontWeight: 700 }}>
            A/B Variant Testing
          </span>
          {enabled && (
            <span style={{
              background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 12, padding: '1px 8px',
              fontSize: 10, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.05em',
            }}>ON</span>
          )}
        </div>
        <div style={{ color: D.dim, fontSize: 11, marginTop: 2 }}>
          {enabled
            ? 'Generates 2 variants — data-led vs story-led — both run through full pipeline'
            : 'Generate one variant or enable to test two angles simultaneously'}
        </div>
      </div>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
            }}
          >
            {[
              { label: 'A', desc: 'Data-led', color: D.accent },
              { label: 'B', desc: 'Story-led', color: D.purple },
            ].map(v => (
              <div key={v.label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: `${v.color}14`, border: `1px solid ${v.color}28`,
                borderRadius: 8, padding: '3px 9px',
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: v.color, color: '#fff',
                  fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{v.label}</span>
                <span style={{ color: v.color, fontSize: 10.5, fontWeight: 600 }}>{v.desc}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ABResultCard — for Dashboard.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface ABVariant {
  run_id: string
  variant: string
  label: string
  brand_score: number | null
  pipeline_complete: boolean
  draft_preview: string
  engagement_rate: number
  feedback_collected: boolean
}

interface ABResult {
  ab_group_id: string
  variants: ABVariant[]
  winner_run_id: string | null
  winner_label: string | null
}

export function ABResultCard({ abGroupId }: { abGroupId: string }) {
  const [result, setResult] = useState<ABResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${BASE}/variants/${abGroupId}`)
      .then(r => r.json())
      .then(d => { setResult(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [abGroupId])

  if (loading) return (
    <div style={{ color: D.sub, fontSize: 12, padding: '8px 0' }}>Loading A/B results…</div>
  )
  if (!result) return null

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <div style={{ color: D.sub, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          A/B Test
        </div>
        {result.winner_label && (
          <span style={{
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 12, padding: '2px 9px',
            fontSize: 10.5, color: D.green, fontWeight: 700,
          }}>
            🏆 {result.winner_label} wins
          </span>
        )}
        {!result.winner_label && result.variants.some(v => !v.feedback_collected) && (
          <span style={{ color: D.dim, fontSize: 10.5 }}>
            Collect analytics on both to declare winner
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {result.variants.map(v => {
          const isWinner = v.run_id === result.winner_run_id
          const color = v.variant === 'A' ? D.accent : D.purple
          const scoreColor = v.brand_score == null ? D.sub
            : v.brand_score >= 0.8 ? D.green : v.brand_score >= 0.6 ? D.amber : D.red

          return (
            <div key={v.run_id} style={{
              background: isWinner ? `${D.green}08` : 'rgba(4,5,12,0.6)',
              border: `1px solid ${isWinner ? `${D.green}35` : `${color}28`}`,
              borderRadius: 10, padding: '12px 14px',
              position: 'relative',
            }}>
              {isWinner && (
                <div style={{
                  position: 'absolute', top: -8, right: 10,
                  background: D.green, color: '#fff',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
                  borderRadius: 10, padding: '2px 8px',
                }}>WINNER</div>
              )}

              {/* Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: color, color: '#fff',
                  fontSize: 10, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{v.variant}</div>
                <span style={{ color, fontSize: 12, fontWeight: 700 }}>{v.label}</span>
                {!v.pipeline_complete && (
                  <span style={{ color: D.dim, fontSize: 10, marginLeft: 'auto' }}>Running…</span>
                )}
              </div>

              {/* Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {v.brand_score != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: D.sub }}>Brand score</span>
                    <span style={{ color: scoreColor, fontWeight: 700 }}>
                      {Math.round(v.brand_score * 100)}/100
                    </span>
                  </div>
                )}
                {v.feedback_collected && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: D.sub }}>Engagement</span>
                    <span style={{ color: D.green, fontWeight: 700 }}>
                      {(v.engagement_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {!v.feedback_collected && v.pipeline_complete && (
                  <div style={{ color: D.dim, fontSize: 10 }}>
                    Collect analytics to see engagement
                  </div>
                )}
              </div>

              {/* Draft preview */}
              {v.draft_preview && (
                <div style={{
                  marginTop: 9, padding: '7px 9px', borderRadius: 7,
                  background: 'rgba(4,5,12,0.7)', border: `1px solid ${D.border}`,
                  color: D.sub, fontSize: 10.5, lineHeight: 1.55,
                  fontStyle: 'italic',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical' as any,
                }}>
                  {v.draft_preview}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}