import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../context/AppContext";
import { MOCK_AUDIT } from "../mock/mockServer";
import { AuditEntry, AuditResponse, DistributionReceipt } from "../types";

const PHOENIX_URL = "http://localhost:6006";

const D = {
  bg: "#04050c",
  surface: "#080a16",
  card: "#0c0f1e",
  border: "rgba(255,255,255,0.07)",
  accent: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  pink: "#ec4899",
  teal: "#14b8a6",
  muted: "#2a3050",
  text: "#e8eaf0",
  sub: "#64748b",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

const AGENT_META: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  profile_loader: { label: "Profile Loader", color: D.accent, icon: "◈" },
  agent0_strategy_advisor: {
    label: "Strategy Advisor",
    color: D.accent,
    icon: "◈",
  },
  agent1_drafter: { label: "Content Drafter", color: D.purple, icon: "✦" },
  agent2_quality_guardian: {
    label: "Brand Compliance",
    color: D.red,
    icon: "⬡",
  },
  agent3_legal_reviewer: { label: "Legal Review", color: D.amber, icon: "⚖" },
  human_gate: { label: "Human Gate", color: D.green, icon: "◉" },
  agent4_localizer: { label: "Localisation", color: D.pink, icon: "◆" },
  agent5_distributor: { label: "Distribution", color: D.teal, icon: "▶" },
  agent6_image_generator: {
    label: "Image Generator",
    color: D.teal,
    icon: "▶",
  },
};

const getAgent = (key: string) =>
  AGENT_META[key] || { label: key, color: D.muted, icon: "○" };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
const sample_audit_trail: AuditResponse = {
  run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
  entries: [
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "profile_loader",
      timestamp: "2026-03-28T15:21:05.476724+00:00",
      action: "profile_loaded",
      decision: "pass",
      detail: '{"company_id": "razorpay_demo"}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent0_strategy_advisor",
      timestamp: "2026-03-28T15:21:12.999432+00:00",
      action: "strategy_skipped_user_specified",
      decision: "pass",
      detail: '{"channel": "linkedin"}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent1_drafter",
      timestamp: "2026-03-28T15:21:24.520374+00:00",
      action: "short_form_drafted",
      decision: "pass",
      detail:
        '{"channel": "linkedin", "revision_count": 1, "draft_length": 320, "target_audience": "default"}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent2_quality_guardian",
      timestamp: "2026-03-28T15:21:25.383704+00:00",
      action: "brand_compliance_checked",
      decision: "pass",
      detail:
        '{"score": 0.85, "semantic_violations": 2, "seo_notes": "The draft is well-structured for LinkedIn and includes relevant hashtags. However, consider adding more specific keywords related to e-commerce and payment solutions to improve discoverability.", "threshold": 0.7}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent3_legal_reviewer",
      timestamp: "2026-03-28T15:21:28.623117+00:00",
      action: "legal_compliance_checked",
      decision: "pass",
      detail:
        '{"claims_checked": 3, "high_flags": 0, "medium_flags": 0, "low_flags": 0, "citations": []}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "human_gate",
      timestamp: "2026-03-28T16:48:29.725297+00:00",
      action: "human_decision_received",
      decision: "approve",
      detail: '{"feedback": "string", "legal_flags_shown": 0}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent6_image_generator",
      timestamp: "2026-03-28T16:48:37.401098+00:00",
      action: "images_generated",
      decision: "pass",
      detail:
        '{"data": {"headline": "Boost Cash Flow Instantly", "subtext": "Access funds in seconds and manage working capital efficiently", "cta": "Learn More", "logo": "brand_images/razorpay/logo.png", "background_image": "brand_images/razorpay/linkedin_background.png", "brand_colors": {"primary": "#072654", "secondary": "#2175ce"}}, "platforms_generated": ["linkedin"], "platforms_failed": [], "paths": {"linkedin": "C:\\\\d\\\\Taran\\\\College\\\\AY 2025-26\\\\ET Hackathon\\\\ETHack\\\\content_pipeline\\\\generated_images\\\\350c4106-53b2-4f7a-9399-5377c75bb9cb_linkedin.png"}}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent4_localizer",
      timestamp: "2026-03-28T16:48:47.279741+00:00",
      action: "localization_complete",
      decision: "pass",
      detail:
        '{"languages_processed": ["en", "hi"], "sarvam_used": true, "fallback_to_llm_only": false}',
    },
    {
      run_id: "350c4106-53b2-4f7a-9399-5377c75bb9cb",
      agent: "agent5_distributor",
      timestamp: "2026-03-28T16:48:47.821865+00:00",
      action: "distribution_complete",
      decision: "pass",
      detail:
        '{"total_channels": 1, "successful": 1, "failed": [], "pattern_written": true, "receipts": [{"channel": "linkedin", "status": "published", "platform_id": "simulated-350c4106"}]}',
    },
  ],
  distribution_receipts: [
    {
      channel: "linkedin",
      platform_id: "simulated-350c4106",
      published_at: "2026-03-28T16:48:47.287951+00:00",
      status: "published",
      error: null,
    },
  ],
};
// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color?: string;
  icon: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        flex: 1,
        background: `linear-gradient(135deg, rgba(8,10,22,0.9) 0%, rgba(12,15,30,0.8) 100%)`,
        border: `1px solid ${color ? `${color}22` : D.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: color ? `0 0 24px ${color}10` : "none",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          background: color ? `${color}18` : "rgba(255,255,255,0.04)",
          border: `1px solid ${color ? `${color}30` : D.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: color || D.sub,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            color: color || D.text,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            fontFamily: "'Syne', sans-serif",
          }}
        >
          {value}
        </div>
        <div
          style={{
            color: D.sub,
            fontSize: 10.5,
            marginTop: 4,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
    </motion.div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  const c = color || D.accent;
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        padding: "5px 13px",
        borderRadius: 20,
        border: `1px solid ${active ? c : D.border}`,
        backgroundColor: active ? `${c}18` : "rgba(8,10,22,0.6)",
        color: active ? c : D.sub,
        fontSize: 11.5,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {active && color && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: c,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </motion.button>
  );
}

// ── Timeline dot ──────────────────────────────────────────────────────────────
function TimelineDot({ color, isLast }: { color: string; isLast: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 14,
      }}
    >
      <div
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}60`,
          flexShrink: 0,
          zIndex: 1,
        }}
      />
      {!isLast && (
        <div
          style={{
            width: 1,
            flex: 1,
            minHeight: 28,
            background: `linear-gradient(to bottom, ${color}40, ${D.border})`,
            marginTop: 4,
          }}
        />
      )}
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────
function EntryRow({
  entry,
  index,
  isLast,
}: {
  entry: AuditEntry;
  index: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const agent = getAgent(entry.agent);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      style={{ display: "flex", gap: 12 }}
    >
      <TimelineDot color={agent.color} isLast={isLast} />
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
        <motion.div
          whileHover={{ borderColor: `${agent.color}45` }}
          onClick={() => setExpanded(!expanded)}
          style={{
            background: expanded ? `${agent.color}08` : "rgba(8,10,22,0.7)",
            border: `1px solid ${expanded ? `${agent.color}40` : D.border}`,
            borderRadius: 12,
            padding: "12px 16px",
            cursor: "pointer",
            transition: "all 0.2s",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                minWidth: 162,
              }}
            >
              <span style={{ color: agent.color, fontSize: 13 }}>
                {agent.icon}
              </span>
              <span
                style={{
                  color: agent.color,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {agent.label}
              </span>
            </div>
            <div style={{ flex: 1, color: D.text, fontSize: 12.5 }}>
              {entry.action}
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              {entry.regulation_cited && (
                <span
                  style={{
                    background: `${D.amber}18`,
                    border: `1px solid ${D.amber}28`,
                    borderRadius: 6,
                    padding: "2px 7px",
                    fontSize: 9.5,
                    color: D.amber,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  REG
                </span>
              )}
              {entry.reasoning && (
                <span
                  style={{
                    background: `${D.purple}18`,
                    border: `1px solid ${D.purple}28`,
                    borderRadius: 6,
                    padding: "2px 7px",
                    fontSize: 9.5,
                    color: D.purple,
                    fontWeight: 700,
                  }}
                >
                  AI
                </span>
              )}
              <span
                style={{
                  color: D.muted,
                  fontSize: 10.5,
                  fontFamily: D.mono,
                }}
              >
                {formatTime(entry.timestamp)}
              </span>
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                style={{
                  color: D.muted,
                  fontSize: 10,
                  display: "inline-block",
                }}
              >
                ▾
              </motion.span>
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
              >
                <div
                  style={{
                    marginTop: 13,
                    paddingTop: 13,
                    borderTop: `1px solid ${D.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: D.sub,
                        fontSize: 9.5,
                        marginBottom: 5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      Decision
                    </div>
                    <div
                      style={{
                        color: D.text,
                        fontSize: 12.5,
                        lineHeight: 1.65,
                      }}
                    >
                      {entry.decision}
                    </div>
                  </div>
                  {entry.regulation_cited && (
                    <div>
                      <div
                        style={{
                          color: D.sub,
                          fontSize: 9.5,
                          marginBottom: 5,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Regulation Cited
                      </div>
                      <div
                        style={{
                          background: "rgba(4,5,12,0.8)",
                          borderRadius: 7,
                          padding: "7px 11px",
                          fontSize: 11.5,
                          color: D.amber,
                          fontFamily: D.mono,
                          border: `1px solid ${D.amber}18`,
                        }}
                      >
                        {entry.regulation_cited}
                      </div>
                    </div>
                  )}
                  {entry.reasoning && (
                    <div>
                      <div
                        style={{
                          color: D.sub,
                          fontSize: 9.5,
                          marginBottom: 5,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Agent Reasoning
                      </div>
                      <div
                        style={{
                          color: D.sub,
                          fontSize: 12.5,
                          lineHeight: 1.65,
                          borderLeft: `2px solid ${D.purple}`,
                          paddingLeft: 11,
                        }}
                      >
                        {entry.reasoning}
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      color: D.muted,
                      fontSize: 10.5,
                      fontFamily: D.mono,
                    }}
                  >
                    {formatDate(entry.timestamp)} ·{" "}
                    {formatTime(entry.timestamp)}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AuditLog() {
  const { companyName } = useApp();
  const [filter, setFilter] = useState<string>("all");

  const entries: AuditEntry[] = sample_audit_trail.entries;
  const agents = [
    "all",
    ...Array.from(new Set(entries.map((e: AuditEntry) => e.agent))),
  ];
  const filtered =
    filter === "all"
      ? entries
      : entries.filter((e: AuditEntry) => e.agent === filter);

  const stats = [
    {
      label: "Total Actions",
      value: entries.length,
      color: undefined,
      icon: "◈",
    },
    {
      label: "Agents Involved",
      value: new Set(entries.map((e: AuditEntry) => e.agent)).size,
      color: D.accent,
      icon: "⬡",
    },
    {
      label: "Regulations",
      value: entries.filter((e: AuditEntry) => e.regulation_cited).length,
      color: D.amber,
      icon: "⚖",
    },
    {
      label: "Revisions",
      value: entries.filter((e: AuditEntry) => e.action.includes("Revision"))
        .length,
      color: D.red,
      icon: "↺",
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }
        .phoenix-btn:hover { background: rgba(139,92,246,0.2) !important; }
      `}</style>

      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          fontFamily: "'DM Sans', sans-serif",
          animation: "fadeUp 0.5s ease both",
        }}
      >
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 28,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  background:
                    "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.22))",
                  border: "1px solid rgba(59,130,246,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                }}
              >
                ◎
              </div>
              <h1
                style={{
                  color: D.text,
                  fontSize: 26,
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: "-0.03em",
                  fontFamily: "'Syne', sans-serif",
                }}
              >
                Audit Trail
              </h1>
            </div>
            <p
              style={{
                color: D.sub,
                fontSize: 13.5,
                margin: 0,
                paddingLeft: 46,
              }}
            >
              Complete decision log for every agent action
              {companyName && (
                <>
                  {" "}
                  — <span style={{ color: D.accent }}>{companyName}</span>
                </>
              )}
            </p>
          </div>

          {/* Phoenix link */}
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href={PHOENIX_URL}
            target="_blank"
            rel="noreferrer"
            className="phoenix-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: `${D.purple}14`,
              border: `1px solid ${D.purple}28`,
              borderRadius: 10,
              padding: "9px 15px",
              color: "#a78bfa",
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 8,
                height: 8,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  backgroundColor: D.purple,
                  animation: "pulse 2s infinite",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  backgroundColor: D.purple,
                  opacity: 0.3,
                  transform: "scale(1.8)",
                }}
              />
            </div>
            Phoenix Dashboard
            <span style={{ opacity: 0.5 }}>↗</span>
          </motion.a>
        </motion.div>

        {/* ── Stats Dashboard Row ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              style={{ flex: 1 }}
            >
              <StatCard {...s} />
            </motion.div>
          ))}
        </div>

        {/* ── Pipeline flow mini-viz ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          style={{
            background: "rgba(8,10,22,0.7)",
            border: `1px solid ${D.border}`,
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              color: D.sub,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginRight: 16,
              flexShrink: 0,
            }}
          >
            Pipeline
          </div>
          {Object.entries(AGENT_META).map(([key, meta], i) => {
            const isInLog = entries.some((e) => e.agent === key);
            return (
              <React.Fragment key={key}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    opacity: isInLog ? 1 : 0.25,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: isInLog
                        ? `${meta.color}20`
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isInLog ? `${meta.color}45` : D.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: isInLog ? meta.color : D.muted,
                      boxShadow: isInLog ? `0 0 12px ${meta.color}20` : "none",
                    }}
                  >
                    {meta.icon}
                  </div>
                  <span
                    style={{
                      fontSize: 8.5,
                      color: D.sub,
                      fontWeight: 600,
                      textAlign: "center",
                      letterSpacing: "0.04em",
                      maxWidth: 50,
                    }}
                  >
                    {meta.label.split(" ")[0]}
                  </span>
                </div>
                {i < Object.keys(AGENT_META).length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: isInLog
                        ? `linear-gradient(90deg, ${meta.color}40, ${D.border})`
                        : D.border,
                      minWidth: 12,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </motion.div>

        {/* ── Filter chips ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            display: "flex",
            gap: 7,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <Chip
            label="All Agents"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {agents
            .filter((a) => a !== "all")
            .map((agent) => {
              const meta = getAgent(agent);
              return (
                <Chip
                  key={agent}
                  label={meta.label}
                  active={filter === agent}
                  color={meta.color}
                  onClick={() => setFilter(agent)}
                />
              );
            })}
        </motion.div>

        {/* ── Timeline ── */}
        <div style={{ paddingLeft: 2 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={filter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {filtered.map((entry: AuditEntry, i: number) => (
                <EntryRow
                  key={i}
                  entry={entry}
                  index={i}
                  isLast={i === filtered.length - 1}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Distribution receipts ── */}
        {MOCK_AUDIT.distribution_receipts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{ marginTop: 24 }}
          >
            <div
              style={{
                color: D.sub,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Distribution Receipts
            </div>
            {MOCK_AUDIT.distribution_receipts.map(
              (r: DistributionReceipt, i: number) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(8,10,22,0.7)",
                    border: `1px solid ${D.border}`,
                    borderRadius: 10,
                    padding: "11px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    color: D.text,
                    marginBottom: 7,
                  }}
                >
                  <span>{r.channel}</span>
                  <span
                    style={{
                      color: r.status === "published" ? D.green : D.amber,
                    }}
                  >
                    {r.status}
                  </span>
                  <span
                    style={{
                      color: D.muted,
                      fontFamily: D.mono,
                      fontSize: 11,
                    }}
                  >
                    {formatTime(r.published_at)}
                  </span>
                </div>
              ),
            )}
          </motion.div>
        )}

        {/* ── Phoenix note ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          style={{
            marginTop: 24,
            background: `${D.purple}0d`,
            border: `1px solid ${D.purple}20`,
            borderRadius: 12,
            padding: "13px 16px",
            display: "flex",
            alignItems: "center",
            gap: 11,
            fontSize: 12.5,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: D.purple,
              flexShrink: 0,
              boxShadow: `0 0 8px ${D.purple}`,
            }}
          />
          <span style={{ color: D.sub }}>
            Full LLM traces, token usage, and latency metrics available in the{" "}
            <a
              href={PHOENIX_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#a78bfa",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Phoenix Dashboard
            </a>{" "}
            at{" "}
            <span
              style={{
                fontFamily: D.mono,
                fontSize: 11,
                color: D.purple,
              }}
            >
              localhost:6006
            </span>
          </span>
        </motion.div>
      </div>
    </>
  );
}
