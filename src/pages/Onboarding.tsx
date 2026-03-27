import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onboardCompany } from '../api/client'
import { useApp } from '../context/AppContext'
import { MOCK_COMPANY_ID, MOCK_COMPANY_NAME } from '../mock/mockServer'

type Tab = 'form' | 'url' | 'demo'

export default function Onboarding() {
  const navigate = useNavigate()
  const { setCompanyId, setCompanyName } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    company_id: '',
    name: '',
    industry: '',
    tone: '',
    brand_voice: '',
    banned_words: '',
    required_disclaimers: '',
    default_persona: '',
    writing_rules: '',
  })

  // URL state
  const [url, setUrl] = useState('')

  const handleFormSubmit = async () => {
    if (!form.company_id || !form.name) {
      setError('Company ID and Name are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onboardCompany({
        ...form,
        banned_words: form.banned_words.split(',').map(w => w.trim()).filter(Boolean),
        required_disclaimers: form.required_disclaimers.split(',').map(d => d.trim()).filter(Boolean),
        approved_terms: {},
      })
      setCompanyId(form.company_id)
      setCompanyName(form.name)
      navigate('/brief')
    } catch {
      setError('Failed to onboard. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const handleUrlSubmit = async () => {
    if (!url) { setError('Please enter a URL.'); return }
    setLoading(true)
    setError('')
    try {
      await onboardCompany({
        company_id: url.replace(/https?:\/\//, '').replace(/\W/g, '_').slice(0, 20),
        name: url,
        industry: 'Auto-detected',
        tone: 'Auto-detected',
        brand_voice: 'Auto-detected',
        banned_words: [],
        required_disclaimers: [],
        approved_terms: {},
        source_url: url,
      })
      setCompanyId('url_company')
      setCompanyName(url)
      navigate('/brief')
    } catch {
      setError('Failed to onboard via URL.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLoad = () => {
    setCompanyId(MOCK_COMPANY_ID)
    setCompanyName(MOCK_COMPANY_NAME)
    navigate('/brief')
  }

  const tabStyle = (t: Tab) => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: activeTab === t ? 500 : 400,
    backgroundColor: activeTab === t ? '#3b82f6' : '#252836',
    color: activeTab === t ? '#ffffff' : '#64748b',
    transition: 'all 0.2s',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#252836',
    border: '1px solid #2e3347',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: 500,
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 600, margin: 0 }}>
          Company Onboarding
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>
          Register your company to start generating compliant content.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <button style={tabStyle('form')} onClick={() => setActiveTab('form')}>Fill Form</button>
        <button style={tabStyle('url')} onClick={() => setActiveTab('url')}>Enter URL</button>
        <button style={tabStyle('demo')} onClick={() => setActiveTab('demo')}>Load Demo</button>
      </div>

      {/* Card */}
      <div style={{ backgroundColor: '#1e2130', borderRadius: 12, padding: 28, border: '1px solid #252836' }}>

        {/* FORM TAB */}
        {activeTab === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Company ID *</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. razorpay_001"
                  value={form.company_id}
                  onChange={e => setForm({ ...form, company_id: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Company Name *</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Razorpay"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Industry</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Fintech"
                  value={form.industry}
                  onChange={e => setForm({ ...form, industry: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Tone</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Professional, Bold"
                  value={form.tone}
                  onChange={e => setForm({ ...form, tone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Brand Voice</label>
              <input
                style={inputStyle}
                placeholder="e.g. Founder-friendly, clear, concise"
                value={form.brand_voice}
                onChange={e => setForm({ ...form, brand_voice: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Banned Words (comma separated)</label>
              <input
                style={inputStyle}
                placeholder="e.g. guaranteed, risk-free, 100% secure"
                value={form.banned_words}
                onChange={e => setForm({ ...form, banned_words: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Required Disclaimers (comma separated)</label>
              <input
                style={inputStyle}
                placeholder="e.g. Subject to RBI guidelines, T&C apply"
                value={form.required_disclaimers}
                onChange={e => setForm({ ...form, required_disclaimers: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Default Persona</label>
              <input
                style={inputStyle}
                placeholder="e.g. Indian startup founders"
                value={form.default_persona}
                onChange={e => setForm({ ...form, default_persona: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Writing Rules</label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                placeholder="e.g. Short sentences. Active voice. Always include CTA."
                value={form.writing_rules}
                onChange={e => setForm({ ...form, writing_rules: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* URL TAB */}
        {activeTab === 'url' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
              Enter your company website or LinkedIn URL. We will crawl it and auto-detect your brand voice, tone, and style.
            </p>
            <div>
              <label style={labelStyle}>Website or LinkedIn URL</label>
              <input
                style={inputStyle}
                placeholder="https://razorpay.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
            </div>
            <div style={{
              backgroundColor: '#2e3347',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              color: '#64748b',
            }}>
              The system will extract tone, vocabulary patterns, and brand voice from your public content and create a profile for confirmation.
            </div>
          </div>
        )}

        {/* DEMO TAB */}
        {activeTab === 'demo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{
              backgroundColor: '#2e3347',
              borderRadius: 8,
              padding: 20,
              border: '1px solid #3b82f620',
            }}>
              <div style={{ color: '#3b82f6', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                PRELOADED DEMO COMPANY
              </div>
              <div style={{ color: '#ffffff', fontSize: 18, fontWeight: 600 }}>Razorpay</div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Fintech / Payment Gateway</div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Tone', value: 'Professional, bold, founder-friendly' },
                  { label: 'Banned words', value: 'guaranteed, risk-free, 100% secure, zero fraud' },
                  { label: 'Disclaimers', value: 'Subject to RBI guidelines, T&C apply' },
                  { label: 'Persona', value: 'Indian startup founders and finance teams' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                    <span style={{ color: '#64748b', minWidth: 100 }}>{item.label}</span>
                    <span style={{ color: '#e2e8f0' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
              This profile is pre-built from real Razorpay content. Use it to demo the full pipeline immediately.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 16,
            backgroundColor: '#ef444420',
            border: '1px solid #ef444440',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#ef4444',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Submit Button */}
        <div style={{ marginTop: 24 }}>
          {activeTab === 'demo' ? (
            <button
              onClick={handleDemoLoad}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Load Razorpay Demo &rarr;
            </button>
          ) : (
            <button
              onClick={activeTab === 'form' ? handleFormSubmit : handleUrlSubmit}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: loading ? '#2e3347' : '#3b82f6',
                color: loading ? '#64748b' : '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Processing...' : 'Register Company \u2192'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}