import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

const links = [
  { path: '/onboard',  label: 'Onboard',     icon: '◈' },
  { path: '/brief',    label: 'New Content',  icon: '✦' },
  { path: '/pipeline', label: 'Pipeline',     icon: '⬡' },
  { path: '/approve',  label: 'Approval',     icon: '◉' },
  { path: '/audit',    label: 'Audit Log',    icon: '◎' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { companyName } = useApp()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
        .nav-link { transition: all 0.18s ease !important; }
        .nav-link:hover { color: #e2e8f0 !important; background: rgba(59,130,246,0.08) !important; }
        .nav-logo:hover { opacity: 0.85; }
      `}</style>

      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        backgroundColor: 'rgba(4,5,12,0.72)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(59,130,246,0.12)',
        boxShadow: '0 1px 0 rgba(59,130,246,0.06), 0 8px 32px rgba(0,0,0,0.4)',
        padding: '0 28px',
      }}>
        <div style={{
          maxWidth: 1152, margin: '0 auto',
          height: 54, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>

          {/* Logo */}
          <button
            className="nav-logo"
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, transition: 'opacity 0.2s',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff', fontWeight: 800,
              boxShadow: '0 0 14px rgba(59,130,246,0.45)',
              fontFamily: "'Syne', sans-serif",
            }}>✦</div>
            <span style={{
              color: '#f0f4ff', fontWeight: 800, fontSize: 14.5,
              letterSpacing: '-0.01em', fontFamily: "'Syne', sans-serif",
            }}>ContentShield</span>
            {companyName && (
              <span style={{
                color: '#3b82f6', fontSize: 11, fontWeight: 600,
                backgroundColor: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 20, padding: '2px 10px',
                letterSpacing: '0.02em',
              }}>
                {companyName}
              </span>
            )}
          </button>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {links.map(link => {
              const isActive = location.pathname === link.path
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className="nav-link"
                  style={{
                    color: isActive ? '#e2e8f0' : '#3a4560',
                    textDecoration: 'none',
                    fontSize: 12.5,
                    fontWeight: isActive ? 700 : 500,
                    padding: '6px 14px',
                    borderRadius: 8,
                    backgroundColor: isActive ? 'rgba(59,130,246,0.14)' : 'transparent',
                    border: isActive ? '1px solid rgba(59,130,246,0.28)' : '1px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 6,
                    letterSpacing: '0.01em',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: 10, opacity: isActive ? 1 : 0.5, color: isActive ? '#3b82f6' : 'inherit' }}>{link.icon}</span>
                  {link.label}
                  {isActive && (
                    <span style={{
                      position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                      width: '60%', height: 2,
                      background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                      borderRadius: 2,
                    }} />
                  )}
                </Link>
              )
            })}
          </div>

        </div>
      </nav>
    </>
  )
}