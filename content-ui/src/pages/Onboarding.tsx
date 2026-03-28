import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onboardCompany } from '../api/client'
import { useApp } from '../context/AppContext'
import { MOCK_COMPANY_ID, MOCK_COMPANY_NAME } from '../mock/mockServer'

type Tab = 'form' | 'url' | 'demo'

// Design tokens — shared across all pages
const D = {
  card: 'rgba(8,10,22,0.75)',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(59,130,246,0.28)',
  accent: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  green: '#10b981',
  red: '#ef4444',
  text: '#e8eaf0',
  sub: '#64748b',
  dim: '#2a3050',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'rgba(4,5,12,0.8)',
  border: `1px solid ${D.border}`,
  borderRadius: 9,
  padding: '10px 14px',
  color: D.text,
  fontSize: 13.5,
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: "'DM Sans', -apple-system, sans-serif",
  boxSizing: 'border-box' as const,
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: D.sub,
  fontSize: 10.5, marginBottom: 7, fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase' as const,
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { setCompanyId, setCompanyName } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>('demo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    company_id: '', name: '', industry: '', tone: '',
    brand_voice: '', banned_words: '', required_disclaimers: '',
    default_persona: '', writing_rules: '',
  })
  const [url, setUrl] = useState('')

  const handleFormSubmit = async () => {
    if (!form.company_id || !form.name) { setError('Company ID and Name are required.'); return }
    setLoading(true); setError('')
    try {
      await onboardCompany({
        ...form,
        banned_words: form.banned_words.split(',').map(w => w.trim()).filter(Boolean),
        required_disclaimers: form.required_disclaimers.split(',').map(d => d.trim()).filter(Boolean),
        approved_terms: {},
      })
      setCompanyId(form.company_id); setCompanyName(form.name); navigate('/brief')
    } catch { setError('Failed to onboard. Make sure the backend is running.') }
    finally { setLoading(false) }
  }

  const handleUrlSubmit = async () => {
    if (!url) { setError('Please enter a URL.'); return }
    setLoading(true); setError('')
    try {
      await onboardCompany({
        company_id: url.replace(/https?:\/\//, '').replace(/\W/g, '_').slice(0, 20),
        name: url, industry: 'Auto-detected', tone: 'Auto-detected',
        brand_voice: 'Auto-detected', banned_words: [], required_disclaimers: [],
        approved_terms: {}, source_url: url,
      })
      setCompanyId('url_company'); setCompanyName(url); navigate('/brief')
    } catch { setError('Failed to onboard via URL.') }
    finally { setLoading(false) }
  }

  const handleDemoLoad = () => {
    setCompanyId(MOCK_COMPANY_ID); setCompanyName(MOCK_COMPANY_NAME); navigate('/brief')
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'demo', label: 'Load Demo', icon: '⚡' },
    { key: 'form', label: 'Fill Form', icon: '◈' },
    { key: 'url', label: 'From URL', icon: '🔗' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .ob-input:focus { border-color: ${D.accent} !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; }
        .ob-tab:hover { background: rgba(59,130,246,0.08) !important; color: #94a3b8 !important; }
        .ob-submit:hover:not(:disabled) { box-shadow: 0 0 32px rgba(59,130,246,0.45) !important; transform: translateY(-1px); }
        .ob-demo-submit:hover { box-shadow: 0 0 28px rgba(59,130,246,0.5) !important; transform: translateY(-1px); }
      `}</style>

      <div style={{ maxWidth: 660, margin: '0 auto', animation: 'fadeUp 0.5s ease both', fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 50, height: 50, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
            border: `1px solid ${D.borderAccent}`,
            marginBottom: 18,
            boxShadow: '0 0 30px rgba(59,130,246,0.12)',
          }}>
            <span style={{ fontSize: 20, fontFamily: "'Syne'" }}>◈</span>
          </div>
          <h1 style={{
            fontSize: 30, fontWeight: 800, margin: '0 0 10px',
            letterSpacing: '-0.03em', color: D.text, fontFamily: "'Syne', sans-serif",
          }}>Company Onboarding</h1>
          <p style={{ color: D.sub, fontSize: 14, margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
            Register your brand profile to generate compliant, on-brand content at scale.
          </p>
          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            {['Brand Compliance', 'Legal Review', 'SEO Optimised', 'Multi-language'].map(f => (
              <span key={f} style={{
                fontSize: 10.5, padding: '3px 11px', borderRadius: 20,
                border: `1px solid ${D.border}`,
                background: 'rgba(255,255,255,0.03)',
                color: D.dim, letterSpacing: '0.03em',
              }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 16,
          background: 'rgba(4,5,12,0.7)', padding: 4, borderRadius: 12,
          border: `1px solid ${D.border}`, backdropFilter: 'blur(12px)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="ob-tab"
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '9px 0',
                borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: activeTab === tab.key ? 700 : 400,
                background: activeTab === tab.key
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.18))'
                  : 'transparent',
                color: activeTab === tab.key ? '#93c5fd' : D.sub,
                transition: 'all 0.2s',
                boxShadow: activeTab === tab.key ? `inset 0 0 0 1px ${D.borderAccent}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 12 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: D.card,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${activeTab === 'demo' ? D.borderAccent : D.border}`,
          borderRadius: 16, padding: '28px 28px 24px',
          boxShadow: activeTab === 'demo' ? '0 0 40px rgba(59,130,246,0.08)' : '0 20px 60px rgba(0,0,0,0.4)',
          transition: 'border-color 0.3s',
        }}>

          {/* ── DEMO TAB ── */}
          {activeTab === 'demo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, #1a56db, #7e3af2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'Syne'",
                }}>R</div>
                <div>
                  <div style={{ color: D.text, fontSize: 18, fontWeight: 700, fontFamily: "'Syne'" }}>Razorpay</div>
                  <div style={{ color: D.sub, fontSize: 12 }}>Fintech · Payment Gateway · India</div>
                </div>
                <div style={{
                  marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(59,130,246,0.14)', border: `1px solid ${D.borderAccent}`,
                  color: '#93c5fd', fontWeight: 700, letterSpacing: '0.06em',
                }}>DEMO</div>
              </div>

              <div style={{ height: 1, background: D.border }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  { label: 'Tone', value: 'Professional, bold, founder-friendly', icon: '🎯' },
                  { label: 'Banned', value: 'guaranteed, risk-free, 100% secure, zero fraud', icon: '🚫' },
                  { label: 'Disclaimers', value: 'Subject to RBI guidelines, T&C apply', icon: '⚖️' },
                  { label: 'Persona', value: 'Indian startup founders and finance teams', icon: '👥' },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '9px 13px', borderRadius: 9,
                    background: 'rgba(255,255,255,0.02)', border: `1px solid ${D.border}`,
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                    <div>
                      <div style={{ color: D.sub, fontSize: 10, fontWeight: 600, marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12.5 }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ color: '#1e2538', fontSize: 11.5, margin: 0, textAlign: 'center' }}>
                Pre-built from real Razorpay brand data — run the full pipeline instantly
              </p>
            </div>
          )}

          {/* ── FORM TAB ── */}
          {activeTab === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Company ID *</label>
                  <input className="ob-input" style={inputStyle} placeholder="razorpay_001"
                    value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Company Name *</label>
                  <input className="ob-input" style={inputStyle} placeholder="Razorpay"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Industry</label>
                  <input className="ob-input" style={inputStyle} placeholder="Fintech"
                    value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Tone</label>
                  <input className="ob-input" style={inputStyle} placeholder="Professional, Bold"
                    value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Brand Voice</label>
                <input className="ob-input" style={inputStyle} placeholder="Founder-friendly, clear, concise"
                  value={form.brand_voice} onChange={e => setForm({ ...form, brand_voice: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Banned Words <span style={{ color: D.sub, fontWeight: 400, textTransform: 'none' }}>(comma-separated)</span></label>
                <input className="ob-input" style={inputStyle} placeholder="guaranteed, risk-free, 100% secure"
                  value={form.banned_words} onChange={e => setForm({ ...form, banned_words: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Required Disclaimers</label>
                <input className="ob-input" style={inputStyle} placeholder="Subject to RBI guidelines, T&C apply"
                  value={form.required_disclaimers} onChange={e => setForm({ ...form, required_disclaimers: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Default Persona</label>
                  <input className="ob-input" style={inputStyle} placeholder="Indian startup founders"
                    value={form.default_persona} onChange={e => setForm({ ...form, default_persona: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Writing Rules</label>
                  <input className="ob-input" style={inputStyle} placeholder="Short sentences. Active voice."
                    value={form.writing_rules} onChange={e => setForm({ ...form, writing_rules: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* ── URL TAB ── */}
          {activeTab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'rgba(59,130,246,0.05)', border: `1px solid rgba(59,130,246,0.15)`,
                borderRadius: 10, padding: '14px 16px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🔍</span>
                <p style={{ color: D.sub, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Enter your company website or LinkedIn URL. We auto-detect brand voice, tone, vocabulary, and style.
                </p>
              </div>
              <div>
                <label style={labelStyle}>Website or LinkedIn URL</label>
                <input className="ob-input" style={inputStyle} placeholder="https://razorpay.com"
                  value={url} onChange={e => setUrl(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Tone detection', 'Vocabulary mapping', 'Brand voice', 'Persona inference'].map(f => (
                  <span key={f} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
                    color: '#6ee7b7',
                  }}>✓ {f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 14,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: 9, padding: '10px 14px', color: '#fca5a5', fontSize: 13,
            }}>{error}</div>
          )}

          {/* Submit */}
          <div style={{ marginTop: 20 }}>
            {activeTab === 'demo' ? (
              <button className="ob-demo-submit" onClick={handleDemoLoad} style={{
                width: '100%', padding: '13px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.22s', letterSpacing: '0.02em',
                boxShadow: '0 0 20px rgba(59,130,246,0.3)',
              }}>
                Load Razorpay Demo →
              </button>
            ) : (
              <button
                className="ob-submit"
                onClick={activeTab === 'form' ? handleFormSubmit : handleUrlSubmit}
                disabled={loading}
                style={{
                  width: '100%', padding: '13px',
                  background: loading ? 'rgba(20,24,40,0.8)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  color: loading ? D.sub : '#fff',
                  border: loading ? `1px solid ${D.border}` : 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.22s', letterSpacing: '0.02em',
                }}
              >
                {loading ? 'Processing…' : 'Register Company →'}
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#1a2030', fontSize: 11.5, marginTop: 18 }}>
          Powered by multi-agent AI · Brand-safe · Regulation-aware
        </p>
      </div>
    </>
  )
}