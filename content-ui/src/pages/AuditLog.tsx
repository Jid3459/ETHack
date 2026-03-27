import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { MOCK_AUDIT } from '../mock/mockServer'
import { AuditEntry, DistributionReceipt } from '../types'

const PHOENIX_URL = 'http://localhost:6006'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#0b0d14',
  surface: '#111520',
  card:    '#161b28',
  border:  '#1e2538',
  accent:  '#3b82f6',
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  purple:  '#8b5cf6',
  cyan:    '#06b6d4',
  pink:    '#ec4899',
  teal:    '#14b8a6',
  muted:   '#4a5568',
  text:    '#e8eaf0',
  sub:     '#8892a4',
  dim:     '#1e2538',
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
}

// ── Agent config ──────────────────────────────────────────────────────────────
const AGENT_META: Record<string, { label: string; color: string; icon: string }> = {
  profile_loader: { label: 'Profile Loader',    color: C.accent,  icon: '◈' },
  drafter:        { label: 'Content Drafter',   color: C.purple,  icon: '✦' },
  brand_checker:  { label: 'Brand Compliance',  color: C.red,     icon: '⬡' },
  legal_reviewer: { label: 'Legal Review',      color: C.amber,   icon: '⚖' },
  seo_checker:    { label: 'SEO Check',         color: C.cyan,    icon: '◎' },
  human_gate:     { label: 'Human Gate',        color: C.green,   icon: '◉' },
  localizer:      { label: 'Localisation',      color: C.pink,    icon: '◆' },
  distributor:    { label: 'Distribution',      color: C.teal,    icon: '▶' },
}

const getAgent = (key: string) =>
  AGENT_META[key] || { label: key, color: C.muted, icon: '○' }

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        flex: 1,
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: color || C.text, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </motion.div>
  )
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  const c = color || C.accent
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        padding: '5px 14px',
        borderRadius: 20,
        border: `1px solid ${active ? c : C.border}`,
        backgroundColor: active ? `${c}18` : C.card,
        color: active ? c : C.sub,
        fontSize: 12, fontWeight: active ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {color && active && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c, display: 'inline-block' }} />
      )}
      {label}
    </motion.button>
  )
}

// ── Timeline dot ──────────────────────────────────────────────────────────────
function TimelineDot({ color, isLast }: { color: string; isLast: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 8px ${color}60`,
        flexShrink: 0, zIndex: 1,
      }} />
      {!isLast && (
        <div style={{
          width: 1, flex: 1, minHeight: 30,
          background: `linear-gradient(to bottom, ${color}50, ${C.border}20)`,
          marginTop: 4,
        }} />
      )}
    </div>
  )
}

// ── Entry row ─────────────────────────────────────────────────────────────────
function EntryRow({ entry, index, isLast }: { entry: AuditEntry; index: number; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const agent = getAgent(entry.agent)

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.045, duration: 0.35 }}
      style={{ display: 'flex', gap: 14 }}
    >
      {/* Timeline */}
      <TimelineDot color={agent.color} isLast={isLast} />

      {/* Card */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 10 }}>
        <motion.div
          whileHover={{ borderColor: `${agent.color}50` }}
          onClick={() => setExpanded(!expanded)}
          style={{
            backgroundColor: C.card,
            border: `1px solid ${expanded ? `${agent.color}50` : C.border}`,
            borderRadius: 11,
            padding: '13px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
        >
          {/* Row header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Agent tag */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              minWidth: 168,
            }}>
              <span style={{ color: agent.color, fontSize: 14 }}>{agent.icon}</span>
              <span style={{ color: agent.color, fontSize: 12, fontWeight: 600 }}>
                {agent.label}
              </span>
            </div>

            {/* Action */}
            <div style={{ flex: 1, color: C.text, fontSize: 13 }}>
              {entry.action}
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {entry.regulation_cited && (
                <span style={{
                  backgroundColor: `${C.amber}18`, border: `1px solid ${C.amber}30`,
                  borderRadius: 6, padding: '2px 8px',
                  fontSize: 10, color: C.amber, fontWeight: 600,
                  letterSpacing: '0.05em',
                }}>
                  REG
                </span>
              )}
              {entry.reasoning && (
                <span style={{
                  backgroundColor: `${C.purple}18`, border: `1px solid ${C.purple}30`,
                  borderRadius: 6, padding: '2px 8px',
                  fontSize: 10, color: C.purple, fontWeight: 600,
                }}>
                  AI
                </span>
              )}
              <span style={{ color: C.muted, fontSize: 11, fontFamily: C.mono }}>
                {formatTime(entry.timestamp)}
              </span>
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                style={{ color: C.muted, fontSize: 11, display: 'inline-block' }}
              >
                ▾
              </motion.span>
            </div>
          </div>

          {/* Expanded detail */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  marginTop: 14, paddingTop: 14,
                  borderTop: `1px solid ${C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  {/* Decision */}
                  <div>
                    <div style={{ color: C.sub, fontSize: 10, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Decision
                    </div>
                    <div style={{ color: C.text, fontSize: 13, lineHeight: 1.65 }}>{entry.decision}</div>
                  </div>

                  {/* Regulation */}
                  {entry.regulation_cited && (
                    <div>
                      <div style={{ color: C.sub, fontSize: 10, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Regulation Cited
                      </div>
                      <div style={{
                        backgroundColor: '#0a0d17', borderRadius: 7,
                        padding: '8px 12px', fontSize: 12,
                        color: C.amber, fontFamily: C.mono,
                        border: `1px solid ${C.amber}20`,
                      }}>
                        {entry.regulation_cited}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  {entry.reasoning && (
                    <div>
                      <div style={{ color: C.sub, fontSize: 10, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Agent Reasoning
                      </div>
                      <div style={{
                        color: C.sub, fontSize: 13, lineHeight: 1.65,
                        borderLeft: `2px solid ${C.purple}`,
                        paddingLeft: 12,
                      }}>
                        {entry.reasoning}
                      </div>
                    </div>
                  )}

                  <div style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>
                    {formatDate(entry.timestamp)} · {formatTime(entry.timestamp)}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AuditLog() {
  const { companyName } = useApp()
  const [filter, setFilter] = useState<string>('all')

  const entries: AuditEntry[] = MOCK_AUDIT.entries
  const agents = ['all', ...Array.from(new Set(entries.map((e: AuditEntry) => e.agent)))]

  const filtered: AuditEntry[] =
    filter === 'all'
      ? entries
      : entries.filter((e: AuditEntry) => e.agent === filter)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <div>
          <h1 style={{ color: C.text, fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Audit Trail
          </h1>
          <p style={{ color: C.sub, fontSize: 14, marginTop: 7 }}>
            Complete decision log for every agent action
            {companyName && (
              <> — <span style={{ color: C.accent }}>{companyName}</span></>
            )}
          </p>
        </div>

        {/* Phoenix link */}
        <motion.a
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          href={PHOENIX_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            backgroundColor: `${C.purple}14`,
            border: `1px solid ${C.purple}30`,
            borderRadius: 10, padding: '10px 16px',
            color: '#a78bfa', fontSize: 13, fontWeight: 500,
            textDecoration: 'none', transition: 'all 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${C.purple}24`)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = `${C.purple}14`)}
        >
          {/* Phoenix pulse dot */}
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%', backgroundColor: C.purple,
              animation: 'pulse 2s infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%', backgroundColor: C.purple,
              opacity: 0.4,
              transform: 'scale(1.8)',
            }} />
          </div>
          Phoenix Dashboard
          <span style={{ opacity: 0.6 }}>↗</span>
        </motion.a>
      </motion.div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Actions"     value={entries.length} />
        <StatCard label="Agents Involved"   value={new Set(entries.map((e: AuditEntry) => e.agent)).size} color={C.accent} />
        <StatCard label="Regulations Cited" value={entries.filter((e: AuditEntry) => e.regulation_cited).length} color={C.amber} />
        <StatCard label="Revisions"         value={entries.filter((e: AuditEntry) => e.action.includes('Revision')).length} color={C.red} />
      </div>

      {/* Filter chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}
      >
        <Chip label="All Agents" active={filter === 'all'} onClick={() => setFilter('all')} />
        {agents.filter(a => a !== 'all').map(agent => {
          const meta = getAgent(agent)
          return (
            <Chip
              key={agent}
              label={meta.label}
              active={filter === agent}
              color={meta.color}
              onClick={() => setFilter(agent)}
            />
          )
        })}
      </motion.div>

      {/* Timeline entries */}
      <div style={{ paddingLeft: 4 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={filter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {filtered.map((entry: AuditEntry, i: number) => (
              <EntryRow key={i} entry={entry} index={i} isLast={i === filtered.length - 1} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Distribution receipts */}
      {MOCK_AUDIT.distribution_receipts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ marginTop: 28 }}
        >
          <div style={{
            color: C.sub, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Distribution Receipts
          </div>
          {MOCK_AUDIT.distribution_receipts.map((r: DistributionReceipt, i: number) => (
            <div key={i} style={{
              backgroundColor: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '12px 18px',
              display: 'flex', justifyContent: 'space-between',
              fontSize: 13, color: C.text, marginBottom: 8,
            }}>
              <span>{r.channel}</span>
              <span style={{ color: r.status === 'published' ? C.green : C.amber }}>{r.status}</span>
              <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 12 }}>{formatTime(r.timestamp)}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Phoenix note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{
          marginTop: 28,
          backgroundColor: `${C.purple}10`,
          border: `1px solid ${C.purple}25`,
          borderRadius: 12, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 13,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: C.purple, flexShrink: 0 }} />
        <span style={{ color: C.sub }}>
          Full LLM traces, token usage, and latency metrics are available in the{' '}
          <a
            href={PHOENIX_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 500 }}
          >
            Phoenix Dashboard
          </a>
          {' '}running at{' '}
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.purple }}>localhost:6006</span>
        </span>
      </motion.div>

      {/* Pulse animation keyframe (inline) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}