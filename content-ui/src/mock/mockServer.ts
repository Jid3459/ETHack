import { AuditResponse, StatusResponse } from '../types'

export const MOCK_COMPANY_ID = 'razorpay_demo'
export const MOCK_COMPANY_NAME = 'Razorpay'

const MOCK_DRAFT = `Razorpay Magic Checkout reduces payment drop-offs by up to 35%.

Pre-filled address, saved cards, and one-tap UPI — built for Indian consumers.

Here is what merchants are seeing:
- 60% faster checkout completion
- 35% reduction in cart abandonment
- 2x repeat purchase rate

Enable Magic Checkout today.

Subject to applicable RBI guidelines. Terms and conditions apply.`

// ── Approval Data ─────────────────────────────────────────────────────────────

export const MOCK_APPROVAL_DATA = {
  draft: MOCK_DRAFT,
  brand_score: 91,
  brand_violations: [
    {
      phrase: 'guaranteed settlement',
      reason: "The word 'guaranteed' is on the banned words list",
      suggestion: 'Replace with "reliable settlement"',
      severity: 'high' as const,
    },
  ],
  legal_flags: [
    {
      phrase: '60% faster checkout completion',
      regulation: 'ASCI Code for Self-Regulation in Advertising',
      section: 'Chapter I, Clause 1.1',
      risk_level: 'medium' as const,
      plain_english: 'Performance claims must be substantiated with verifiable data.',
      suggestion: 'Add a footnote citing internal benchmark data.',
    },
  ],
  seo_suggestions: [
    {
      type: 'keyword_density',
      message: 'Add "payment gateway" in the first paragraph.',
      impact: 'medium' as const,
    },
  ],
}

// ── Mock Status Cycling ───────────────────────────────────────────────────────

const runStepMap: Record<string, number> = {}
const runApprovedMap: Record<string, boolean> = {}

const PRE_APPROVAL_STEPS = [
  'profile_loader',
  'drafter',
  'brand_checker_fail',
  'drafter_revision',
  'brand_checker_pass',
  'legal_reviewer',
  'seo_checker',
  'awaiting_human',
]

const POST_APPROVAL_STEPS = [
  'localizer',
  'distributor',
  'complete',
]

export function getMockStatus(runId: string): StatusResponse {
  if (!(runId in runStepMap)) runStepMap[runId] = 0

  const approved = runApprovedMap[runId] ?? false
  const steps = approved ? POST_APPROVAL_STEPS : PRE_APPROVAL_STEPS
  const idx = runStepMap[runId]
  const step = steps[Math.min(idx, steps.length - 1)]

  if (idx < steps.length - 1) runStepMap[runId] = idx + 1

  const base: StatusResponse = {
    run_id: runId,
    status: 'running',
    current_node: null,
    revision_count: 0,
    brand_score: null,
    brand_passed: false,
    legal_passed: false,
    legal_flags_count: 0,
    draft_preview: '',
    awaiting_human: false,
    pipeline_complete: false,
    approval_data: null,
  }

  switch (step) {
    case 'profile_loader':
      return { ...base, current_node: 'profile_loader' }
    case 'drafter':
      return { ...base, current_node: 'drafter', draft_preview: 'Drafting content...' }
    case 'brand_checker_fail':
      return { ...base, current_node: 'brand_checker', revision_count: 1, brand_score: 52, brand_passed: false }
    case 'drafter_revision':
      return { ...base, current_node: 'drafter', revision_count: 1, draft_preview: 'Revising draft...' }
    case 'brand_checker_pass':
      return { ...base, current_node: 'brand_checker', revision_count: 1, brand_score: 91, brand_passed: true }
    case 'legal_reviewer':
      return { ...base, current_node: 'legal_reviewer', brand_score: 91, brand_passed: true, legal_flags_count: 1 }
    case 'seo_checker':
      return { ...base, current_node: 'seo_checker', brand_score: 91, brand_passed: true, legal_passed: true }
    case 'awaiting_human':
      return {
        ...base,
        status: 'awaiting_human',
        current_node: 'human_gate',
        awaiting_human: true,
        brand_score: 91,
        brand_passed: true,
        legal_passed: true,
        legal_flags_count: 1,
        revision_count: 1,
        draft_preview: MOCK_DRAFT,
        approval_data: MOCK_APPROVAL_DATA,
      }
    case 'localizer':
      return { ...base, current_node: 'localizer', brand_passed: true, legal_passed: true }
    case 'distributor':
      return { ...base, current_node: 'distributor', brand_passed: true, legal_passed: true }
    case 'complete':
      return {
        ...base,
        status: 'complete',
        pipeline_complete: true,
        brand_score: 91,
        brand_passed: true,
        legal_passed: true,
      }
    default:
      return base
  }
}

export function mockApprove(runId: string, decision: 'approve' | 'reject') {
  if (decision === 'approve') {
    runApprovedMap[runId] = true
    runStepMap[runId] = 0
  }
  return { run_id: runId, decision }
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

export const MOCK_AUDIT: AuditResponse = {
  run_id: 'mock_run_001',
  entries: [
    {
      timestamp: new Date(Date.now() - 300000).toISOString(),
      agent: 'profile_loader',
      action: 'Loaded company profile',
      decision: 'Loaded Razorpay profile with 4 banned words and 2 disclaimers',
    },
    {
      timestamp: new Date(Date.now() - 270000).toISOString(),
      agent: 'drafter',
      action: 'Generated initial draft',
      decision: 'Draft created for LinkedIn channel',
    },
    {
      timestamp: new Date(Date.now() - 240000).toISOString(),
      agent: 'brand_checker',
      action: 'Brand check FAILED',
      decision: 'Score 52/100 — found banned word: "guaranteed". Routing back to drafter.',
      reasoning: 'The phrase "guaranteed settlement" violates the banned words list.',
    },
    {
      timestamp: new Date(Date.now() - 210000).toISOString(),
      agent: 'drafter',
      action: 'Revision 1 applied',
      decision: 'Replaced "guaranteed settlement" with "reliable settlement"',
    },
    {
      timestamp: new Date(Date.now() - 180000).toISOString(),
      agent: 'brand_checker',
      action: 'Brand check PASSED',
      decision: 'Score 91/100. Routing to legal review.',
    },
    {
      timestamp: new Date(Date.now() - 150000).toISOString(),
      agent: 'legal_reviewer',
      action: 'Legal check complete',
      decision: '1 medium-risk flag. Passed to human gate.',
      regulation_cited: 'ASCI Code Chapter I, Clause 1.1',
      reasoning: '"60% faster" claim requires substantiation per ASCI guidelines.',
    },
    {
      timestamp: new Date(Date.now() - 120000).toISOString(),
      agent: 'seo_checker',
      action: 'SEO analysis complete',
      decision: '2 advisory suggestions. No blocking issues.',
    },
    {
      timestamp: new Date(Date.now() - 60000).toISOString(),
      agent: 'human_gate',
      action: 'Awaiting human approval',
      decision: 'Pipeline paused. Approval interface presented.',
    },
  ],
  distribution_receipts: [],
}