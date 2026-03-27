import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startRun } from '../api/client'
import { useApp } from '../context/AppContext'

const CHANNELS = ['LinkedIn', 'Twitter', 'Blog', 'Email', 'Instagram']
const CONTENT_TYPES = ['Post', 'Article', 'Newsletter', 'Ad Copy', 'Press Release']
const LANGUAGES = ['en', 'hi', 'ta', 'te', 'bn']
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali'
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

  const toggleLanguage = (lang: string) => {
    setLanguages(prev =>
      prev.includes(lang)
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    )
  }

  const handleSubmit = async () => {
    if (!brief.trim()) { setError('Please enter a content brief.'); return }
    if (!companyId) { setError('No company loaded. Please go back to Onboarding.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await startRun({
        company_id: companyId,
        brief,
        channel,
        content_type: contentType,
        target_languages: languages,
      })
      setRunId(res.run_id)
      navigate('/pipeline')
    } catch {
      setError('Failed to start pipeline. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#252836',
    border: '1px solid #2e3347',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: 500,
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 20,
    border: `1px solid ${active ? '#3b82f6' : '#2e3347'}`,
    backgroundColor: active ? '#3b82f620' : '#252836',
    color: active ? '#3b82f6' : '#64748b',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 500 : 400,
    transition: 'all 0.15s',
  })

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 600, margin: 0 }}>
          New Content
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 8 }}>
          {companyName
            ? <span>Creating for <span style={{ color: '#3b82f6' }}>{companyName}</span></span>
            : 'No company loaded — go to Onboarding first'}
        </p>
      </div>

      {/* Card */}
      <div style={{ backgroundColor: '#1e2130', borderRadius: 12, padding: 28, border: '1px solid #252836', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Brief */}
        <div>
          <label style={labelStyle}>Content Brief *</label>
          <textarea
            style={{ ...inputStyle, height: 120, resize: 'vertical' }}
            placeholder="Describe what you want to create. E.g. — Write a LinkedIn post announcing Razorpay Magic Checkout and its impact on reducing cart abandonment for Indian e-commerce merchants."
            value={brief}
            onChange={e => setBrief(e.target.value)}
          />
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'right' }}>
            {brief.length} characters
          </div>
        </div>

        {/* Channel */}
        <div>
          <label style={labelStyle}>Channel</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHANNELS.map(c => (
              <button
                key={c}
                style={chipStyle(channel === c)}
                onClick={() => setChannel(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Content Type */}
        <div>
          <label style={labelStyle}>Content Type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CONTENT_TYPES.map(t => (
              <button
                key={t}
                style={chipStyle(contentType === t)}
                onClick={() => setContentType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Languages */}
        <div>
          <label style={labelStyle}>Target Languages</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LANGUAGES.map(l => (
              <button
                key={l}
                style={chipStyle(languages.includes(l))}
                onClick={() => toggleLanguage(l)}
              >
                {LANGUAGE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div style={{
          backgroundColor: '#252836',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex',
          gap: 24,
          fontSize: 13,
        }}>
          {[
            { label: 'Channel', value: channel },
            { label: 'Type', value: contentType },
            { label: 'Languages', value: languages.map(l => LANGUAGE_LABELS[l]).join(', ') },
            { label: 'Company', value: companyName || '—' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ color: '#64748b', marginBottom: 2 }}>{item.label}</div>
              <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
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

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !brief.trim()}
          style={{
            width: '100%',
            padding: '13px',
            backgroundColor: loading || !brief.trim() ? '#2e3347' : '#3b82f6',
            color: loading || !brief.trim() ? '#64748b' : '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 500,
            cursor: loading || !brief.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Starting pipeline...' : 'Run Content Pipeline \u2192'}
        </button>

      </div>
    </div>
  )
}