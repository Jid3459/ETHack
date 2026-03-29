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

// ── Existing endpoints ────────────────────────────────────────────────────────

export const onboardCompany = (data: Record<string, any>) =>
  api.post('/onboard', data).then(r => r.data)

export const startRun = (data: {
  company_id: string
  brief: string
  channel: string
  content_type: string
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboard = (companyId: string, limit = 50) =>
  api.get(`/dashboard/${companyId}`, { params: { limit } }).then(r => r.data)

export const updateSchedule = (runId: string, scheduledTime: string, channels?: string[]) =>
  api.post(`/schedule/${runId}`, {
    scheduled_time: scheduledTime,
    ...(channels ? { channels } : {}),
  }).then(r => r.data)

export const triggerFeedbackCollection = (runId: string) =>
  api.post(`/feedback/${runId}`).then(r => r.data)

export const getFeedback = (runId: string) =>
  api.get(`/feedback/${runId}`).then(r => r.data)

// ── ROI ───────────────────────────────────────────────────────────────────────

export const getROIMetrics = (companyId: string) =>
  api.get(`/roi/${companyId}`).then(r => r.data)

// ── Knowledge / Document ingestion ───────────────────────────────────────────

/**
 * Upload a document for knowledge ingestion.
 * Uses multipart/form-data — do NOT use the api axios instance (sets JSON header).
 * Use native fetch instead (done inside KnowledgeUploader.tsx directly).
 */
export const listKnowledgeDocs = (companyId: string) =>
  api.get(`/ingest/${companyId}`).then(r => r.data)

// No uploadDocument export — KnowledgeUploader uses native fetch with FormData
// to avoid Content-Type header conflict with axios JSON interceptor.

// ── A/B Variant testing ───────────────────────────────────────────────────────

export const startABRun = (data: {
  company_id: string
  brief: string
  channel: string
  content_type: string
  target_languages: string[]
  scheduled_time?: string
}) => api.post('/run/variants', data).then(r => r.data as {
  ab_group_id: string
  variant_a: { run_id: string; label: string; angle: string }
  variant_b: { run_id: string; label: string; angle: string }
  status: string
})

export const getABResults = (abGroupId: string) =>
  api.get(`/variants/${abGroupId}`).then(r => r.data)