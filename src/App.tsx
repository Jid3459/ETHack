import React from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Navbar from './components/layout/Navbar'

import Onboarding from './pages/Onboarding'
import BriefInput from './pages/BriefInput'
import PipelineProgress from './pages/PipelineProgress'
import HumanApproval from './pages/HumanApproval'
import AuditLog from './pages/AuditLog'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div style={{ minHeight: '100vh', backgroundColor: '#0f1117' }}>
          <Navbar />
          <main className="max-w-6xl mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/onboard" />} />
              <Route path="/onboard" element={<Onboarding />} />
              <Route path="/brief" element={<BriefInput />} />
              <Route path="/pipeline" element={<PipelineProgress />} />
              <Route path="/approve" element={<HumanApproval />} />
              <Route path="/audit" element={<AuditLog />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  )
}