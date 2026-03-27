import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getMockStatus } from '../mock/mockServer'
import { StatusResponse, AgentName } from '../types'

const AGENTS: { key: AgentName; label: string; description: string }[] = [
  { key: 'profile_loader', label: 'Profile Loader',     description: 'Loading company brand profile' },
  { key: 'drafter',        label: 'Content Drafter',    description: 'Generating content draft' },
  { key: 'brand_checker',  label: 'Brand Compliance',   description: 'Checking brand guidelines' },
  { key: 'legal_reviewer', label: 'Legal Review',       description: 'Checking regulatory compliance' },
  { key: 'seo_checker',    label: 'SEO Check',          description: 'Analysing discoverability' },
  { key: 'human_gate',     label: 'Human Approval',     description: 'Awaiting your review' },
  { key: 'localizer',      label: 'Localisation',       description: 'Translating to target languages' },
  { key: 'distributor',    label: 'Distribution',       description: 'Publishing to channels' },
]

type CardState = 'pending' | 'active' | 'passed' | 'failed' | 'waiting'

function getCardState(
  agentKey: AgentName,
  status: StatusResponse,
): CardState {
  const current = status.current_node

  if (agentKey === 'brand_checker') {
    if (current === 'brand_checker') {
      return status.brand_passed === false && status.brand_score !== null ? 'failed' : 'active'
    }
    if (status.brand_passed) return 'passed'
  }

  if (agentKey === 'legal_reviewer') {
    if (current === 'legal_reviewer') return 'active'
    if (status.legal_passed) return 'passed'
  }

  if (agentKey === 'human_gate') {
    if (status.status === 'awaiting_human') return 'waiting'
    if (status.pipeline_complete) return 'passed'
  }

  if (current === agentKey) return 'active'

  const order = AGENTS.map(a => a.key)
  const currentIdx = order.indexOf(current as AgentName)
  const agentIdx = order.indexOf(agentKey)

  if (status.pipeline_complete) return 'passed'
  if (currentIdx > agentIdx) return 'passed'
  return 'pending'
}

function cardColors(state: CardState) {
  switch (state) {
    case 'active':  return { bg: '#1e3a5f', border: '#3b82f6', dot: '#3b82f6', label: '#93c5fd' }
    case 'passed':  return { bg: '#14291a', border: '#22c55e', dot: '#22c55e', label: '#86efac' }
    case 'failed':  return { bg: '#2d1a1a', border: '#ef4444', dot: '#ef4444', label: '#fca5a5' }
    case 'waiting': return { bg: '#2d2310', border: '#f59e0b', dot: '#f59e0b', label: '#fcd34d' }
    default:        return { bg: '#1e2130', border: '#2e3347', dot: '#2e3347', label: '#64748b' }
  }
}

function stateLabel(state: CardState) {
  switch (state) {
    case 'active':  return 'Running...'
    case 'passed':  return 'Passed'
    case 'failed':  return 'Needs revision'
    case 'waiting': return 'Awaiting you'
    default:        return 'Pending'
  }
}

export default function PipelineProgress() {
  const navigate = useNavigate()
  const { runId, companyName } = useApp()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null)

  // Start mock polling
  useEffect(() => {
    const mockRunId = runId || 'mock_demo_run'

    const addLog = (msg: string) =>
      setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30))

    const poll = () => {
      const s = getMockStatus(mockRunId)
      setStatus(s)

      if (s.current_node) addLog(`Agent: ${s.current_node} — ${s.status}`)
      if (s.revision_count > 0 && s.current_node === 'drafter')
        addLog(`Revision ${s.revision_count} triggered — fixing brand violations`)
      if (s.brand_passed && s.current_node === 'brand_checker')
        addLog(`Brand score: ${s.brand_score}/100 — passed`)
      if (s.status === 'awaiting_human')
        addLog('Pipeline paused — human review required')
      if (s.status === 'complete')
        addLog('Pipeline complete — content published')

      if (
        s.status === 'awaiting_human' ||
        s.status === 'complete' ||
        s.status === 'error'
      ) {
        clearInterval(id)
      }
    }

    poll()
    const id = setInterval(poll, 2000)
    setIntervalId(id)
    return () => clearInterval(id)
  }, [runId])

  // Auto-navigate to approval when awaiting human
  useEffect(() => {
    if (status?.status === 'awaiting_human') {
      setTimeout(() => navigate('/approve'), 1500)
    }
  }, [status?.status])

  const revisionActive =
    status?.current_node === 'drafter' && (status?.revision_count ?? 0) > 0

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 600, margin: 0 }}>
          Pipeline Running
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>
          {companyName
            ? <span>Processing for <span style={{ color: '#3b82f6' }}>{companyName}</span></span>
            : 'Processing content...'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>

        {/* Left — Agent Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {AGENTS.map((agent, idx) => {
            const state = status ? getCardState(agent.key, status) : 'pending'
            const colors = cardColors(state)
            const isBrandFailed = agent.key === 'brand_checker' && state === 'failed'

            return (
              <React.Fragment key={agent.key}>
                <div style={{
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  transition: 'all 0.3s',
                }}>
                  {/* Dot */}
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: colors.dot,
                    flexShrink: 0,
                    boxShadow: state === 'active' ? `0 0 8px ${colors.dot}` : 'none',
                  }} />

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>
                      {agent.label}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      {agent.description}
                    </div>
                  </div>

                  {/* Status label */}
                  <div style={{ color: colors.label, fontSize: 12, fontWeight: 500 }}>
                    {stateLabel(state)}
                  </div>

                  {/* Brand score badge */}
                  {agent.key === 'brand_checker' && status?.brand_score !== null && (
                    <div style={{
                      backgroundColor: '#0f1117',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      color: (status?.brand_score ?? 0) >= 80 ? '#22c55e' : '#ef4444',
                      fontWeight: 600,
                    }}>
                      {status?.brand_score}/100
                    </div>
                  )}

                  {/* Legal flags badge */}
                  {agent.key === 'legal_reviewer' && (status?.legal_flags_count ?? 0) > 0 && (
                    <div style={{
                      backgroundColor: '#f59e0b20',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      color: '#f59e0b',
                      fontWeight: 600,
                    }}>
                      {status?.legal_flags_count ?? 0} flag{(status?.legal_flags_count ?? 0) > 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Revision badge */}
                  {agent.key === 'drafter' && (status?.revision_count ?? 0) > 0 && (
                    <div style={{
                      backgroundColor: '#3b82f620',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      color: '#3b82f6',
                      fontWeight: 600,
                    }}>
                      Rev {status?.revision_count}
                    </div>
                  )}
                </div>

                {/* Revision loop arrow — between brand_checker and drafter */}
                {isBrandFailed && revisionActive && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 18px',
                    backgroundColor: '#2d1a1a',
                    border: '1px dashed #ef444460',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#fca5a5',
                  }}>
                    <span style={{ fontSize: 16 }}>&#8635;</span>
                    Brand violation detected &mdash; routing back to Content Drafter for revision
                  </div>
                )}
              </React.Fragment>
            )
          })}

          {/* Complete banner */}
          {status?.pipeline_complete && (
            <div style={{
              backgroundColor: '#14291a',
              border: '1px solid #22c55e',
              borderRadius: 10,
              padding: '16px 18px',
              textAlign: 'center',
              color: '#86efac',
              fontSize: 15,
              fontWeight: 500,
            }}>
              Content published successfully
            </div>
          )}
        </div>

        {/* Right — Live Log */}
        <div style={{
          backgroundColor: '#1e2130',
          border: '1px solid #252836',
          borderRadius: 10,
          padding: 16,
          height: 'fit-content',
          position: 'sticky',
          top: 24,
        }}>
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 12, letterSpacing: 1 }}>
            LIVE LOG
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.length === 0 && (
              <div style={{ color: '#2e3347', fontSize: 12 }}>Waiting for pipeline...</div>
            )}
            {logs.map((log, i) => (
              <div key={i} style={{
                fontSize: 11,
                color: i === 0 ? '#e2e8f0' : '#64748b',
                fontFamily: 'monospace',
                lineHeight: 1.5,
                borderLeft: i === 0 ? '2px solid #3b82f6' : '2px solid transparent',
                paddingLeft: 8,
              }}>
                {log}
              </div>
            ))}
          </div>

          {/* Draft preview */}
          {status?.draft_preview && (
            <div style={{ marginTop: 16, borderTop: '1px solid #252836', paddingTop: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 8, letterSpacing: 1 }}>
                DRAFT PREVIEW
              </div>
              <div style={{
                fontSize: 12,
                color: '#94a3b8',
                fontStyle: 'italic',
                lineHeight: 1.6,
              }}>
                {status.draft_preview.slice(0, 200)}
                {status.draft_preview.length > 200 ? '...' : ''}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}