import React, { createContext, useContext, useState } from 'react'

interface AppState {
  companyId: string
  setCompanyId: (id: string) => void
  runId: string
  setRunId: (id: string) => void
  companyName: string
  setCompanyName: (name: string) => void
}

const AppContext = createContext<AppState>({} as AppState)

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [companyId, setCompanyId] = useState('')
  const [runId, setRunId] = useState('')
  const [companyName, setCompanyName] = useState('')

  return (
    <AppContext.Provider value={{
      companyId, setCompanyId,
      runId, setRunId,
      companyName, setCompanyName,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)