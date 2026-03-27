import { useCallback, useEffect, useRef, useState } from 'react'
import { getStatus } from '../api/client'
import { StatusResponse } from '../types'

const POLL_INTERVAL_MS = 2000

interface UsePollStatusResult {
  status: StatusResponse | null
  error: string | null
  isPolling: boolean
  stopPolling: () => void
  startPolling: () => void
}

export function usePollStatus(runId: string | null): UsePollStatusResult {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  const poll = useCallback(async (id: string) => {
    try {
      const data = await getStatus(id)
      setStatus(data)
      setError(null)
      if (
        data.status === 'complete' ||
        data.status === 'error' ||
        data.status === 'awaiting_human'
      ) {
        stopPolling()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch status')
    }
  }, [stopPolling])

  const startPolling = useCallback(() => {
    if (!runId) return
    setIsPolling(true)
    poll(runId)
    intervalRef.current = setInterval(() => poll(runId), POLL_INTERVAL_MS)
  }, [runId, poll])

  useEffect(() => {
    if (!runId) return
    startPolling()
    return () => stopPolling()
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { status, error, isPolling, stopPolling, startPolling }
}
