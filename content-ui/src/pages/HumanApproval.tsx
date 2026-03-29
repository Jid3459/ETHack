import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useApp } from "../context/AppContext";
import { getStatus, submitApproval } from "../api/client";
import { MOCK_APPROVAL_DATA, mockApprove } from "../mock/mockServer";
import {
  ApprovalData,
  BrandViolation,
  LegalFlag,
  SEOSuggestion,
  StatusResponse,
} from "../types";

// ── Design System ──────────────────────────────────────────────────────────────
const T = {
  bg:        '#050709',
  surface:   '#0c0f1a',
  card:      '#111827',
  cardHover: '#131c2e',
  border:    '#253050',                  // was '#1e2d45' — brighter
  borderGlow:'#3b82f6',
  accent:    '#3b82f6',
  accentGlow:'rgba(59,130,246,0.15)',
  green:     '#10b981',
  greenDim:  'rgba(16,185,129,0.12)',
  amber:     '#f59e0b',
  amberDim:  'rgba(245,158,11,0.12)',
  red:       '#ef4444',
  redDim:    'rgba(239,68,68,0.12)',
  purple:    '#8b5cf6',
  cyan:      '#06b6d4',
  text:      '#eef0f8',                  // was '#f0f4ff'
  sub:       '#9aaac4',                  // was '#6b7a99'
  dim:       '#354060',                  // was '#1a2540'
  mono:      "'JetBrains Mono','Fira Code',monospace",
}


// ── Severity helpers ────────────────────────────────────────────────────────────
const sevColor = (l: "high" | "medium" | "low") =>
  l === "high" ? T.red : l === "medium" ? T.amber : T.green;
const sevBg = (l: "high" | "medium" | "low") =>
  l === "high" ? T.redDim : l === "medium" ? T.amberDim : T.greenDim;

// ── SVG Score Ring ──────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 80 ? T.green : score >= 60 ? T.amber : T.red;
  const glowId = `glow-${score}`;
  return (
    <motion.svg
      width={size}
      height={size}
      initial={{ rotate: -90 }}
      style={{ display: "block" }}
    >
      <defs>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1e2d45"
        strokeWidth="6"
      />
      {/* filled */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - (score / 100) * circ }}
        transition={{ duration: 1.4, ease: "easeOut", delay: 0.4 }}
        filter={`url(#${glowId})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={size * 0.22}
        fontWeight={700}
        fontFamily="-apple-system,sans-serif"
        transform={`rotate(90,${size / 2},${size / 2})`}
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.16}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={T.sub}
        fontSize={size * 0.11}
        fontFamily="-apple-system,sans-serif"
        transform={`rotate(90,${size / 2},${size / 2})`}
      >
        /100
      </text>
    </motion.svg>
  );
}

// ── Section Badge ───────────────────────────────────────────────────────────────
function SectionBadge({ count, color }: { count: number; color: string }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", delay: 0.3 }}
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {count}
    </motion.span>
  );
}

// ── Pill Label ──────────────────────────────────────────────────────────────────
function Pill({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

// ── Draft Panel ─────────────────────────────────────────────────────────────────
function DraftPanel({
  draft,
  brandViolations,
  legalFlags,
}: {
  draft: string;
  brandViolations: BrandViolation[];
  legalFlags: LegalFlag[];
}) {
  const brandPhrases = brandViolations.map((v) => v.phrase);
  const legalPhrases = legalFlags.map((f) => f.phrase);

  function highlightLine(line: string) {
    let parts: { text: string; type: "brand" | "legal" | "normal" }[] = [
      { text: line, type: "normal" },
    ];
    for (const phrase of brandPhrases) {
      parts = parts.flatMap((p) => {
        if (p.type !== "normal") return [p];
        const i = p.text.toLowerCase().indexOf(phrase.toLowerCase());
        if (i === -1) return [p];
        return [
          { text: p.text.slice(0, i), type: "normal" as const },
          { text: p.text.slice(i, i + phrase.length), type: "brand" as const },
          { text: p.text.slice(i + phrase.length), type: "normal" as const },
        ].filter((x) => x.text);
      });
    }
    for (const phrase of legalPhrases) {
      parts = parts.flatMap((p) => {
        if (p.type !== "normal") return [p];
        const i = p.text.toLowerCase().indexOf(phrase.toLowerCase());
        if (i === -1) return [p];
        return [
          { text: p.text.slice(0, i), type: "normal" as const },
          { text: p.text.slice(i, i + phrase.length), type: "legal" as const },
          { text: p.text.slice(i + phrase.length), type: "normal" as const },
        ].filter((x) => x.text);
      });
    }
    return parts.map((p, i) => {
      if (p.type === "brand")
        return (
          <mark
            key={i}
            title="Brand violation"
            style={{
              background: "rgba(245,158,11,0.2)",
              color: "#fbbf24",
              borderBottom: `2px solid ${T.amber}`,
              padding: "0 3px",
              borderRadius: 2,
              cursor: "help",
              textDecoration: "none",
            }}
          >
            {p.text}
          </mark>
        );
      if (p.type === "legal")
        return (
          <mark
            key={i}
            title="Legal flag"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#f87171",
              borderBottom: `2px solid ${T.red}`,
              padding: "0 3px",
              borderRadius: 2,
              cursor: "help",
              textDecoration: "none",
            }}
          >
            {p.text}
          </mark>
        );
      return <span key={i}>{p.text}</span>;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background:
            "linear-gradient(90deg, rgba(59,130,246,0.06) 0%, transparent 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: T.accent,
              boxShadow: `0 0 8px ${T.accent}`,
            }}
          />
          <span
            style={{
              color: T.text,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            Content Draft
          </span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {[
            { color: T.amber, label: "Brand violation" },
            { color: T.red, label: "Legal flag" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: T.sub,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 3,
                  backgroundColor: item.color,
                  borderRadius: 2,
                  opacity: 0.9,
                }}
              />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* Draft body */}
      <div
        style={{
          padding: "22px 24px",
          fontFamily: "Georgia,'Times New Roman',serif",
          fontSize: 14.5,
          lineHeight: 1.9,
          color: T.text,
          maxHeight: 320,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {draft.split("\n").map((line, i) => (
          <div key={i} style={{ minHeight: line ? undefined : "1em" }}>
            {highlightLine(line)}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Violation Card ──────────────────────────────────────────────────────────────
function ViolationCard({
  children,
  level,
  delay = 0,
}: {
  children: React.ReactNode;
  level: "high" | "medium" | "low";
  delay?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const color = sevColor(level);
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? sevBg(level) : `${T.bg}88`,
        border: `1px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        padding: "14px 16px",
        transition: "background-color 0.2s",
        boxShadow: hovered ? `0 0 20px ${color}15` : "none",
      }}
    >
      {children}
    </motion.div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────────
function Section({
  title,
  icon,
  count,
  color,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  count: number;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          cursor: "pointer",
          borderBottom: open ? `1px solid ${T.border}` : "none",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = `${color}08`)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>
            {title}
          </span>
          <SectionBadge count={count} color={color} />
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          style={{ color: T.sub, fontSize: 12, display: "inline-block" }}
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Brand Panel ─────────────────────────────────────────────────────────────────
function BrandPanel({
  score,
  violations,
}: {
  score: number;
  violations: BrandViolation[];
}) {
  const color = score >= 80 ? T.green : T.red;
  return (
    <Section
      title="Brand Compliance"
      icon="⬡"
      count={violations.length}
      color={color}
      defaultOpen
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 8,
        }}
      >
        <ScoreRing score={score * 100} size={80} />
        <div>
          <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>
            {score >= 0.8 ? "Brand Approved" : "Needs Revision"}
          </div>
          <div style={{ color: T.sub, fontSize: 12, marginTop: 4 }}>
            {violations.length} violation{violations.length !== 1 ? "s" : ""}{" "}
            detected
          </div>
          <div
            style={{
              marginTop: 8,
              width: 140,
              height: 4,
              borderRadius: 2,
              background: T.border,
              overflow: "hidden",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 1.2, delay: 0.5 }}
              style={{ height: "100%", background: color, borderRadius: 2 }}
            />
          </div>
        </div>
      </div>
      {violations.map((v, i) => (
        <ViolationCard key={i} level={v.severity} delay={i * 0.07}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Pill
              label={v.severity}
              color={sevColor(v.severity)}
              bg={sevBg(v.severity)}
            />
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.amber }}>
              "{v.phrase}"
            </span>
          </div>
          <div style={{ color: T.sub, fontSize: 12, marginBottom: 6 }}>
            {v.reason}
          </div>
          <div
            style={{
              color: T.green,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ opacity: 0.7 }}>→</span> {v.fix_suggestion}
          </div>
        </ViolationCard>
      ))}
    </Section>
  );
}

// ── Legal Panel ─────────────────────────────────────────────────────────────────
function LegalPanel({ flags }: { flags: LegalFlag[] }) {
  return (
    <Section title="Legal Review" icon="⚖" count={flags.length} color={T.amber}>
      {flags.length === 0 && (
        <div style={{ color: T.green, fontSize: 13, padding: "8px 0" }}>
          ✓ No legal flags
        </div>
      )}
      {flags.map((f, i) => (
        <ViolationCard key={i} level={f.risk_level} delay={i * 0.07}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Pill
              label={`${f.risk_level} risk`}
              color={sevColor(f.risk_level)}
              bg={sevBg(f.risk_level)}
            />
            <span
              style={{ fontFamily: T.mono, fontSize: 12, color: "#f87171" }}
            >
              "{f.phrase}"
            </span>
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 11,
              color: T.amber,
              background: "#0a0e1a",
              padding: "6px 10px",
              borderRadius: 6,
              marginBottom: 8,
            }}
          >
            {f.regulation} § {f.section}
          </div>
          <div style={{ color: T.sub, fontSize: 12, marginBottom: 5 }}>
            {f.plain_english}
          </div>
          <div style={{ color: T.green, fontSize: 12 }}>→ {f.suggestion}</div>
        </ViolationCard>
      ))}
    </Section>
  );
}

// ── SEO Panel ───────────────────────────────────────────────────────────────────
function SEOPanel({ suggestions: suggestion }: { suggestions: string }) {
  return (
    <Section title="SEO Advisory" icon="◎" count={1} color={T.cyan}>
      {suggestion.length === 0 && (
        <div style={{ color: T.green, fontSize: 13, padding: "8px 0" }}>
          ✓ SEO looks good
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        style={{
          background: "rgba(6,182,212,0.07)",
          borderLeft: `3px solid ${T.cyan}`,
          borderRadius: 10,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: T.cyan,
            marginTop: 5,
            flexShrink: 0,
            boxShadow: `0 0 6px ${T.cyan}`,
          }}
        />
        <div>
          <div style={{ color: T.text, fontSize: 13, marginBottom: 4 }}>
            {suggestion}
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

// ── Decision Bar ────────────────────────────────────────────────────────────────
function DecisionBar({
  decision,
  setDecision,
  feedback,
  setFeedback,
  submitting,
  onSubmit,
}: {
  decision: "approve" | "reject" | null;
  setDecision: (d: "approve" | "reject") => void;
  feedback: string;
  setFeedback: (s: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: 22,
      }}
    >
      <div
        style={{
          color: T.sub,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Your Decision
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: decision === "reject" ? 16 : 0,
        }}
      >
        {/* Approve */}
        <motion.button
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setDecision("approve")}
          style={{
            flex: 1,
            padding: "14px 0",
            backgroundColor: decision === "approve" ? T.green : "transparent",
            border: `1px solid ${decision === "approve" ? T.green : `${T.green}35`}`,
            borderRadius: 10,
            cursor: "pointer",
            color: decision === "approve" ? "#fff" : T.green,
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s",
            boxShadow:
              decision === "approve" ? `0 0 20px ${T.green}30` : "none",
          }}
        >
          <span>✓</span> Approve & Publish
        </motion.button>
        {/* Reject */}
        <motion.button
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setDecision("reject")}
          style={{
            flex: 1,
            padding: "14px 0",
            backgroundColor: decision === "reject" ? T.red : "transparent",
            border: `1px solid ${decision === "reject" ? T.red : `${T.red}35`}`,
            borderRadius: 10,
            cursor: "pointer",
            color: decision === "reject" ? "#fff" : T.red,
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s",
            boxShadow: decision === "reject" ? `0 0 20px ${T.red}30` : "none",
          }}
        >
          <span>✗</span> Reject & Revise
        </motion.button>
      </div>

      <AnimatePresence>
        {decision === "reject" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                color: T.sub,
                fontSize: 12,
                marginBottom: 8,
                marginTop: 4,
              }}
            >
              Feedback for revision agent
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Stronger opening line. Avoid passive voice. Add specific metrics."
              style={{
                width: "100%",
                height: 80,
                backgroundColor: "#080b14",
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "10px 13px",
                color: T.text,
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {decision && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginTop: 14 }}
          >
            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              onClick={onSubmit}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "14px",
                background: submitting
                  ? T.dim
                  : `linear-gradient(135deg, ${T.accent}, #6366f1)`,
                color: submitting ? T.sub : "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow: submitting
                  ? "none"
                  : `0 4px 20px rgba(59,130,246,0.35)`,
              }}
            >
              {submitting
                ? "Submitting…"
                : `Confirm ${decision === "approve" ? "Approval" : "Rejection"} →`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────
export default function HumanApproval() {
  const navigate = useNavigate();
  const { runId } = useApp();
  const [approval, setApproval] = useState<ApprovalData | null>(null);
  useEffect(() => {
    if (!runId) return;

    const getApprovalData = async () => {
      try {
        const status = await getStatus(runId);
        setApproval(status.approval_data);
      } catch (e) {
        console.error("Failed to fetch approval data", e);
      }
    };

    getApprovalData();
  }, [runId]);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);
    try {
      await submitApproval(runId, decision, feedback || undefined);
      setSubmitted(true);
      setTimeout(
        () => navigate(decision === "approve" ? "/audit" : "/brief"),
        1600,
      );
    } catch {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────────
  if (submitted) {
    const ok = decision === "approve";
    return (
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            maxWidth: 440,
            width: "100%",
            backgroundColor: T.card,
            borderRadius: 20,
            padding: "48px 36px",
            textAlign: "center",
            border: `1px solid ${ok ? `${T.green}50` : `${T.red}50`}`,
            boxShadow: `0 0 60px ${ok ? `${T.green}18` : `${T.red}18`}`,
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 280, delay: 0.1 }}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              margin: "0 auto 24px",
              backgroundColor: ok ? `${T.green}18` : `${T.red}18`,
              border: `2px solid ${ok ? T.green : T.red}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              boxShadow: `0 0 30px ${ok ? T.green : T.red}30`,
            }}
          >
            {ok ? "✓" : "✗"}
          </motion.div>
          <div
            style={{
              color: T.text,
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {ok ? "Content Approved" : "Sent Back for Revision"}
          </div>
          <div style={{ color: T.sub, fontSize: 14, lineHeight: 1.6 }}>
            {ok
              ? "Resuming pipeline — localisation and distribution running…"
              : "Feedback injected — agent will revise the draft…"}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Header strip ─────────────────────────────────────────────────────────────
  if (!runId || !approval) {
    return (
      <div
        style={{
          backgroundColor: "black",
          opacity: 0.5,
          padding: "48px",
          fontSize: "24px",
          textAlign: "center",
          borderRadius: "16px",
          color: "white",
        }}
      >
        {runId !== "" ? "Loading" : "Pipeline hasn't been run yet"}
      </div>
    );
  }
  const metricCards = [
    {
      label: "Brand Score",
      value: `${approval.brand_score * 100}/100`,
      color: approval.brand_score >= 0.8 ? T.green : T.red,
    },
    {
      label: "Legal Flags",
      value: String(approval.legal_flags.length),
      color: approval.legal_flags.length ? T.amber : T.green,
    },
    {
      label: "SEO Tips",
      value: `${1}`,
      color: T.cyan,
    },
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", paddingBottom: 40 }}>
      {/* ── Ambient glow ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 800,
          height: 300,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse at top, rgba(59,130,246,0.06) 0%, transparent 70%)",
        }}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ── Page header ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.accent}33, ${T.purple}33)`,
                  border: `1px solid ${T.accent}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                }}
              >
                ◉
              </div>
              <h1
                style={{
                  color: T.text,
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Human Review Gate
              </h1>
            </div>
            <p style={{ color: T.sub, fontSize: 14, margin: 0 }}>
              Review the draft and compliance reports before publishing
            </p>
          </div>

          {/* Quick metric strip */}
          <div style={{ display: "flex", gap: 10 }}>
            {metricCards.map((m) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: "10px 18px",
                  textAlign: "center",
                  boxShadow: `0 0 20px ${m.color}10`,
                }}
              >
                <div
                  style={{
                    color: T.sub,
                    fontSize: 10,
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {m.label}
                </div>
                <div style={{ color: m.color, fontSize: 18, fontWeight: 700 }}>
                  {m.value}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Two-column body ───────────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 20,
          }}
        >
          {/* Left: draft + decision */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <DraftPanel
              draft={approval.draft}
              brandViolations={approval.brand_violations}
              legalFlags={approval.legal_flags}
            />
            <DecisionBar
              decision={decision}
              setDecision={setDecision}
              feedback={feedback}
              setFeedback={setFeedback}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Right: reports */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <BrandPanel
              score={approval.brand_score}
              violations={approval.brand_violations}
            />
            <LegalPanel flags={approval.legal_flags} />
            <SEOPanel suggestions={approval.seo_suggestions} />
          </div>
        </div>
      </div>
    </div>
  );
}
