import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startRun } from '../api/client'
import { useApp } from '../context/AppContext'

const D = {
  card: 'rgba(8,10,22,0.75)',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(59,130,246,0.28)',
  accent: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  text: '#e8eaf0',
  sub: '#64748b',
}

const CHANNELS = ['LinkedIn', 'Twitter', 'Blog', 'Email', 'Instagram']
const CONTENT_TYPES = ['Post', 'Article', 'Newsletter', 'Ad Copy', 'Press Release']
const LANGUAGES = ['en', 'hi', 'ta', 'te', 'bn']
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali',
}

export default function BriefInput() {
  const navigate = useNavigate()
  const { companyId, companyName, setRunId } = useApp()

  const [brief, setBrief] = useState('')
  const [channel, setChannel] = useState('LinkedIn')
  const [contentType, setContentType] = useState('Post')
  const [languages, setLanguages] = useState<string[]>(['en'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleLanguage = (lang: string) =>
    setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])

  const handleSubmit = async () => {
    if (!brief.trim()) { setError('Please enter a content brief.'); return }
    if (!companyId) { setError('No company loaded. Go back to Onboarding.'); return }
    setLoading(true); setError('')
    try {
      const res = await startRun({ company_id: companyId, brief, channel, content_type: contentType, target_languages: languages })
      setRunId(res.run_id)
      navigate('/pipeline')
    } catch { setError('Failed to start pipeline. Make sure the backend is running.') }
    finally { setLoading(false) }
  }

  const chip = (active: boolean, accent = D.accent): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12.5,
    border: `1px solid ${active ? accent : D.border}`,
    background: active ? `${accent}18` : 'rgba(4,5,12,0.5)',
    color: active ? accent : '#3a4560',
    fontWeight: active ? 700 : 400,
    transition: 'all 0.18s',
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .brief-textarea:focus { border-color: ${D.accent} !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; }
        .chip-btn:hover { opacity: 0.8; transform: scale(1.02); }
        .run-btn:hover:not(:disabled) { box-shadow: 0 0 36px rgba(59,130,246,0.5) !important; transform: translateY(-1px); }
      `}</style>

      <div style={{ maxWidth: 700, margin: '0 auto', animation: 'fadeUp 0.5s ease both', fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.22))',
              border: `1px solid ${D.borderAccent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            }}>✦</div>
            <h1 style={{
              color: D.text, fontSize: 26, fontWeight: 800, margin: 0,
              letterSpacing: '-0.03em', fontFamily: "'Syne', sans-serif",
            }}>New Content</h1>
          </div>
          <p style={{ color: D.sub, fontSize: 13.5, margin: 0, paddingLeft: 46 }}>
            {companyName
              ? <>Creating for <span style={{ color: D.accent, fontWeight: 600 }}>{companyName}</span></>
              : <span style={{ color: '#ef4444' }}>No company loaded — go to Onboarding first</span>}
          </p>
        </div>

        {/* Main card */}
        <div style={{
          background: D.card,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${D.border}`,
          borderRadius: 18,
          padding: 28,
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* Brief */}
          <div>
            <label style={{ display: 'block', color: D.sub, fontSize: 10.5, fontWeight: 600, marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Content Brief <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className="brief-textarea"
              style={{
                width: '100%', height: 120, resize: 'vertical', lineHeight: 1.65,
                backgroundColor: 'rgba(4,5,12,0.8)',
                border: `1px solid ${D.border}`, borderRadius: 10,
                padding: '11px 14px', color: D.text, fontSize: 13.5,
                outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
                fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
              }}
              placeholder="Describe what you want to create. E.g. — Write a LinkedIn post announcing Razorpay Magic Checkout and its impact on reducing cart abandonment for Indian e-commerce merchants."
              value={brief}
              onChange={e => setBrief(e.target.value)}
            />
            <div style={{ color: '#1e2538', fontSize: 11, marginTop: 4, textAlign: 'right', fontFamily: 'monospace' }}>
              {brief.length} chars
            </div>
          </div>

          {/* Channel */}
          <div>
            <label style={{ display: 'block', color: D.sub, fontSize: 10.5, fontWeight: 600, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Channel
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CHANNELS.map(c => (
                <button key={c} className="chip-btn" style={chip(channel === c)} onClick={() => setChannel(c)}>{c}</button>
              ))}
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label style={{ display: 'block', color: D.sub, fontSize: 10.5, fontWeight: 600, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Content Type
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CONTENT_TYPES.map(t => (
                <button key={t} className="chip-btn" style={chip(contentType === t, D.purple)} onClick={() => setContentType(t)}>{t}</button>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div>
            <label style={{ display: 'block', color: D.sub, fontSize: 10.5, fontWeight: 600, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Target Languages
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LANGUAGES.map(l => (
                <button key={l} className="chip-btn" style={chip(languages.includes(l), D.cyan)} onClick={() => toggleLanguage(l)}>
                  {LANGUAGE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          {/* Summary strip */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`,
            borderRadius: 10, padding: '13px 16px',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          }}>
            {[
              { label: 'Channel',   value: channel },
              { label: 'Type',      value: contentType },
              { label: 'Languages', value: languages.map(l => LANGUAGE_LABELS[l]).join(', ') || '—' },
              { label: 'Company',   value: companyName || '—' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: '#2a3050', fontSize: 9.5, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{item.label}</div>
                <div style={{ color: '#64748b', fontSize: 12, fontWeight: 500 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 9, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            className="run-btn"
            onClick={handleSubmit}
            disabled={loading || !brief.trim()}
            style={{
              width: '100%', padding: '14px',
              background: loading || !brief.trim()
                ? 'rgba(20,24,40,0.6)'
                : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)',
              color: loading || !brief.trim() ? '#2a3050' : '#fff',
              border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 700,
              cursor: loading || !brief.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.22s', letterSpacing: '0.02em',
              boxShadow: loading || !brief.trim() ? 'none' : '0 0 0 1px rgba(99,102,241,0.3)',
            }}
          >
            {loading ? 'Starting pipeline…' : 'Run Content Pipeline →'}
          </button>
        </div>
      </div>
    </>
  )
}