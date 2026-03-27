import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

const links = [
  { path: '/onboard',  label: 'Onboard' },
  { path: '/brief',    label: 'New Content' },
  { path: '/pipeline', label: 'Pipeline' },
  { path: '/audit',    label: 'Audit Log' },
]

export default function Navbar() {
  const location = useLocation()
  const { companyName } = useApp()

  return (
    <nav style={{ backgroundColor: '#1e2130', borderBottom: '1px solid #252836' }} className="px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">

        <div className="flex items-center gap-3">
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
          <span className="text-white font-semibold text-sm tracking-wide">
            ContentShield
          </span>
          {companyName && (
            <span style={{ color: '#64748b' }} className="text-sm">
              &mdash; {companyName}
            </span>
          )}
        </div>

        <div className="flex gap-6">
          {links.map(link => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                color: location.pathname === link.path ? '#ffffff' : '#64748b',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: location.pathname === link.path ? 500 : 400,
                transition: 'color 0.2s',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

      </div>
    </nav>
  )
}