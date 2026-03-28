import axios from 'axios'
import { AuditResponse, RunSummary, StatusResponse } from '../types'

export const BASE_URL = 'http://localhost:8001'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const detail = err.response?.data?.detail || err.message
    console.error(`[API Error] ${status ?? 'Network'}: ${detail}`)
    return Promise.reject(err)
  }
)

export const onboardCompany = (data: Record<string, any>) =>
  api.post('/onboard', data).then(r => r.data)

export const startRun = (data: {
  company_id: string
  brief: string
  channel: string
  content_type: string
  target_audience?: string
  target_languages: string[]
  scheduled_time?: string
}) => api.post('/run', data).then(r => r.data as { run_id: string })

export const getStatus = (runId: string) =>
  api.get(`/status/${runId}`).then(r => r.data as StatusResponse)

export const submitApproval = (
  runId: string,
  decision: 'approve' | 'reject',
  feedback?: string
) => api.post(`/approve/${runId}`, { decision, feedback }).then(r => r.data)

export const getAudit = (runId: string) =>
  api.get(`/audit/${runId}`).then(r => r.data as AuditResponse)

export const listRuns = (companyId: string) =>
  api.get(`/runs/${companyId}`).then(r => r.data as { runs: RunSummary[] })