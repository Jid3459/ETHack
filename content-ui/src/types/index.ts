export interface CompanyProfile {
  company_id: string
  name: string
  industry: string
  tone: string
  brand_voice: string
  banned_words: string[]
  required_disclaimers: string[]
  approved_terms: Record<string, string>
  default_persona: string
  writing_rules: string
}

export type RunStatus =
  | 'not_started'
  | 'running'
  | 'awaiting_human'
  | 'complete'
  | 'error'

export type AgentName =
  | 'profile_loader'
  | 'drafter'
  | 'brand_checker'
  | 'legal_reviewer'
  | 'seo_checker'
  | 'human_gate'
  | 'localizer'
  | 'distributor'

export interface BrandViolation {
  phrase: string
  reason: string
  suggestion: string
  severity: 'high' | 'medium' | 'low'
}

export interface LegalFlag {
  phrase: string
  regulation: string
  section: string
  risk_level: 'high' | 'medium' | 'low'
  plain_english: string
  suggestion: string
}

export interface SEOSuggestion {
  type: string
  message: string
  impact: 'high' | 'medium' | 'low'
}

export interface ApprovalData {
  draft: string
  brand_score: number
  brand_violations: BrandViolation[]
  legal_flags: LegalFlag[]
  seo_suggestions?: SEOSuggestion[]
}

export interface StatusResponse {
  run_id: string
  status: RunStatus
  current_node: AgentName | null
  revision_count: number
  brand_score: number | null
  brand_passed: boolean
  legal_passed: boolean
  legal_flags_count: number
  draft_preview: string
  awaiting_human: boolean
  pipeline_complete: boolean
  approval_data: ApprovalData | null
}

export interface AuditEntry {
  timestamp: string
  agent: AgentName
  action: string
  decision: string
  regulation_cited?: string
  reasoning?: string
}

export interface AuditResponse {
  run_id: string
  entries: AuditEntry[]
  distribution_receipts: DistributionReceipt[]
}

export interface DistributionReceipt {
  channel: string
  status: string
  url?: string
  timestamp: string
}

export interface RunSummary {
  run_id: string
  brief: string
  started_at: string
  company_id: string
}