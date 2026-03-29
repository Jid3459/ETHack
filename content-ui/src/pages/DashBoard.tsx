import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../context/AppContext";
import ROIImpactStrip from "../components/ROIImpactStrip";
import { ABResultCard } from "../components/ABVariantPanel";

// ─── API calls ────────────────────────────────────────────────────────────────
const BASE = "http://localhost:8000";

async function fetchDashboard(companyId: string) {
  const r = await fetch(`${BASE}/dashboard/${companyId}`);
  if (!r.ok) throw new Error("Dashboard fetch failed");
  return r.json();
}

async function triggerFeedback(runId: string) {
  const r = await fetch(`${BASE}/feedback/${runId}`, { method: "POST" });
  return r.json();
}

async function updateSchedule(runId: string, scheduledTime: string) {
  const r = await fetch(`${BASE}/schedule/${runId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_time: scheduledTime }),
  });
  return r.json();
}

// ─── Design tokens (consistent with rest of app) ──────────────────────────────
const D = {
  bg: "#04050c",
  card: "rgba(8,10,22,0.82)",
  border: "rgba(255,255,255,0.1)", // was 0.07
  accent: "#3b82f6",
  purple: "#8b5cf6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
  pink: "#ec4899",
  teal: "#14b8a6",
  text: "#eef0f8", // was '#e8eaf0'
  sub: "#9aaac4", // was '#64748b'
  dim: "#5a6a8a", // was '#2a3050'
  mono: "'JetBrains Mono', monospace",
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<
  string,
  { label: string; color: string; icon: string; dot: string }
> = {
  drafting: { label: "Drafting", color: D.accent, icon: "✦", dot: "#3b82f6" },
  awaiting_approval: {
    label: "Needs Review",
    color: D.amber,
    icon: "◉",
    dot: "#f59e0b",
  },
  scheduled: { label: "Scheduled", color: D.purple, icon: "◆", dot: "#8b5cf6" },
  published: { label: "Published", color: D.green, icon: "▶", dot: "#10b981" },
  failed: { label: "Failed", color: D.red, icon: "✕", dot: "#ef4444" },
};

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "in",
  twitter: "𝕏",
  blog: "✍",
  email: "✉",
  instagram: "◉",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface RunItem {
  ab_group?: any;
  run_id: string;
  brief: string;
  started_at: string;
  status_bucket: string;
  scheduled_time?: string;
  channel: string;
  content_type: string;
  brand_score?: number;
  pipeline_complete: boolean;
  awaiting_human: boolean;
  receipts: {
    channel: string;
    status: string;
    platform_id: string;
    published_at: string;
  }[];
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    reach: number;
  };
  channel_analytics: {
    channel: string;
    engagement_rate: string;
    analytics: any;
    stored_at?: string;
  }[];
  feedback_collected: boolean;
  variant?: string;
  variant_label?: string;
}

interface DashboardData {
  company_id: string;
  summary: Record<string, number>;
  engagement_totals: Record<string, number>;
  knowledge_sources: { files: number; chunks: number };
  runs: RunItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtScheduled(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function engagementRate(e: RunItem["engagement"]): string {
  if (!e.reach) return "—";
  return (((e.likes + e.comments + e.shares) / e.reach) * 100).toFixed(1) + "%";
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
  icon,
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  icon: string;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        flex: 1,
        background: D.card,
        border: `1px solid ${color ? color + "22" : D.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: color ? `0 0 28px ${color}0d` : "none",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          flexShrink: 0,
          background: color ? `${color}18` : "rgba(255,255,255,0.04)",
          border: `1px solid ${color ? color + "30" : D.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: color || D.sub,
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
            marginTop: 3,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        {sub && (
          <div style={{ color: D.dim, fontSize: 10, marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Schedule picker modal ────────────────────────────────────────────────────
function ScheduleModal({
  run,
  onClose,
  onSave,
}: {
  run: RunItem;
  onClose: () => void;
  onSave: (time: string) => void;
}) {
  const [dt, setDt] = useState(run.scheduled_time?.slice(0, 16) || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!dt) return;
    setSaving(true);
    // Convert local datetime to ISO
    const iso = new Date(dt).toISOString();
    await onSave(iso);
    setSaving(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4,5,12,0.85)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(10,13,28,0.98)",
          border: `1px solid ${D.border}`,
          borderRadius: 18,
          padding: "28px",
          width: 380,
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: D.text,
            marginBottom: 6,
            fontFamily: "'Syne'",
          }}
        >
          Schedule Post
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: D.sub,
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {run.brief}
        </div>
        <label
          style={{
            display: "block",
            color: D.sub,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Date & Time
        </label>
        <input
          type="datetime-local"
          value={dt}
          onChange={(e) => setDt(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 13px",
            background: "rgba(4,5,12,0.8)",
            border: `1px solid ${D.border}`,
            borderRadius: 9,
            color: D.text,
            fontSize: 13,
            outline: "none",
            fontFamily: "'DM Sans', sans-serif",
            boxSizing: "border-box",
            colorScheme: "dark",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px",
              borderRadius: 9,
              border: `1px solid ${D.border}`,
              background: "transparent",
              color: D.sub,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dt}
            style={{
              flex: 1,
              padding: "11px",
              borderRadius: 9,
              border: "none",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || !dt ? "not-allowed" : "pointer",
              opacity: saving || !dt ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Confirm Schedule"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Run card ─────────────────────────────────────────────────────────────────
function RunCard({
  run,
  onSchedule,
  onCollectFeedback,
  onGoToPipeline,
  onGoToApproval,
}: {
  run: RunItem;
  onSchedule: (run: RunItem) => void;
  onCollectFeedback: (runId: string) => void;
  onGoToPipeline: (runId: string) => void;
  onGoToApproval: (runId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CFG[run.status_bucket] || STATUS_CFG.drafting;
  const score = run.brand_score;
  const scoreColor =
    score == null
      ? D.sub
      : score >= 0.8
        ? D.green
        : score >= 0.6
          ? D.amber
          : D.red;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: D.card,
        border: `1px solid ${D.border}`,
        borderRadius: 14,
        overflow: "hidden",
        backdropFilter: "blur(10px)",
        transition: "border-color 0.2s",
      }}
    >
      {/* Card header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "14px 18px",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "14px 1fr auto auto auto auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: cfg.dot,
            boxShadow: `0 0 8px ${cfg.dot}80`,
            flexShrink: 0,
            animation:
              run.status_bucket === "drafting"
                ? "dashPing 1.6s ease infinite"
                : "none",
          }}
        />

        {/* Brief */}
        <div>
          <div
            style={{
              color: D.text,
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.4,
              marginBottom: 3,
            }}
          >
            {run.brief}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: D.sub, fontSize: 10.5 }}>
              {relTime(run.started_at)}
            </span>
            {run.channel && (
              <span
                style={{
                  background: `${D.accent}14`,
                  border: `1px solid ${D.accent}28`,
                  borderRadius: 12,
                  padding: "1px 8px",
                  fontSize: 10,
                  color: D.accent,
                  fontWeight: 600,
                }}
              >
                {CHANNEL_ICONS[run.channel] || run.channel} {run.channel}
              </span>
            )}
            {run.content_type && (
              <span style={{ color: D.dim, fontSize: 10 }}>
                {run.content_type}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: `${cfg.color}14`,
            border: `1px solid ${cfg.color}28`,
            borderRadius: 20,
            padding: "4px 11px",
            fontSize: 11,
            color: cfg.color,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10 }}>{cfg.icon}</span>
          {cfg.label}
        </div>

        {/* Brand score */}
        {score != null && (
          <div
            style={{
              background: `${scoreColor}14`,
              border: `1px solid ${scoreColor}28`,
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 11,
              color: scoreColor,
              fontWeight: 700,
              flexShrink: 0,
              fontFamily: D.mono,
            }}
          >
            ⬡ {Math.round(score * 100)}
          </div>
        )}

        {/* Engagement rate */}
        {run.feedback_collected && (
          <div
            style={{
              color: D.sub,
              fontSize: 11,
              fontFamily: D.mono,
              flexShrink: 0,
            }}
          >
            {engagementRate(run.engagement)} eng.
          </div>
        )}

        {/* Expand chevron */}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          style={{
            color: D.dim,
            fontSize: 11,
            display: "inline-block",
            flexShrink: 0,
          }}
        >
          ▾
        </motion.span>
      </div>

      {/* Scheduled time bar */}
      {run.scheduled_time && run.status_bucket === "scheduled" && (
        <div
          style={{
            padding: "6px 18px",
            background: `${D.purple}0c`,
            borderTop: `1px solid ${D.purple}18`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
          }}
        >
          <span style={{ color: D.purple }}>◆</span>
          <span style={{ color: D.sub }}>Scheduled for</span>
          <span style={{ color: D.purple, fontWeight: 700 }}>
            {fmtScheduled(run.scheduled_time)}
          </span>
        </div>
      )}

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", borderTop: `1px solid ${D.border}` }}
          >
            <div
              style={{
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Distribution receipts */}
              {run.receipts.length > 0 && (
                <div>
                  <div
                    style={{
                      color: D.sub,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Distribution
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {run.receipts.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          background: "rgba(4,5,12,0.7)",
                          border: `1px solid ${D.border}`,
                          borderRadius: 9,
                          padding: "8px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 11.5,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>
                          {CHANNEL_ICONS[r.channel] || "●"}
                        </span>
                        <span style={{ color: D.text, fontWeight: 600 }}>
                          {r.channel}
                        </span>
                        <span
                          style={{
                            color:
                              r.status === "published"
                                ? D.green
                                : r.status === "scheduled"
                                  ? D.purple
                                  : D.red,
                            fontWeight: 700,
                            fontSize: 10,
                          }}
                        >
                          {r.status}
                        </span>
                        {r.platform_id && (
                          <span
                            style={{
                              color: D.dim,
                              fontFamily: D.mono,
                              fontSize: 10,
                            }}
                          >
                            #{r.platform_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Engagement analytics */}
              {run.feedback_collected && run.channel_analytics.length > 0 && (
                <div>
                  <div
                    style={{
                      color: D.sub,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Engagement Analytics
                  </div>
                  {run.channel_analytics.map((ca, i) => (
                    <div
                      key={i}
                      style={{
                        background: "rgba(4,5,12,0.6)",
                        border: `1px solid ${D.border}`,
                        borderRadius: 9,
                        padding: "10px 14px",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            color: D.text,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {ca.channel}
                        </span>
                        <span
                          style={{
                            color: D.green,
                            fontFamily: D.mono,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {(parseFloat(ca.engagement_rate) * 100).toFixed(1)}%
                          engagement
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        {[
                          ["❤", ca.analytics.likes, "likes"],
                          ["💬", ca.analytics.comments, "comments"],
                          ["↗", ca.analytics.shares, "shares"],
                          ["👆", ca.analytics.clicks, "clicks"],
                          ["👁", ca.analytics.reach, "reach"],
                        ].map(([icon, val, lbl]) => (
                          <div
                            key={String(lbl)}
                            style={{ textAlign: "center" }}
                          >
                            <div
                              style={{
                                color: D.text,
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              {val}
                            </div>
                            <div
                              style={{
                                color: D.dim,
                                fontSize: 9.5,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {icon} {lbl}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              # -------new addition by me for AB group-------
              {run.ab_group && (
                <div>
                  <div
                    style={{
                      color: D.sub,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    A/B Comparison
                  </div>
                  <ABResultCard abGroupId={run.ab_group} />
                </div>
              )}
              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {run.status_bucket === "awaiting_approval" && (
                  <button
                    onClick={() => onGoToApproval(run.run_id)}
                    style={btnStyle(D.amber)}
                  >
                    ◉ Review & Approve
                  </button>
                )}
                {run.status_bucket === "drafting" && (
                  <button
                    onClick={() => onGoToPipeline(run.run_id)}
                    style={btnStyle(D.accent)}
                  >
                    ✦ View Pipeline
                  </button>
                )}
                {(run.status_bucket === "published" ||
                  run.status_bucket === "scheduled") &&
                  !run.feedback_collected && (
                    <button
                      onClick={() => onCollectFeedback(run.run_id)}
                      style={btnStyle(D.cyan)}
                    >
                      ◎ Collect Analytics
                    </button>
                  )}
                {run.status_bucket === "scheduled" && (
                  <button
                    onClick={() => onSchedule(run)}
                    style={btnStyle(D.purple)}
                  >
                    ◆ Reschedule
                  </button>
                )}
                {run.status_bucket === "awaiting_approval" && (
                  <button
                    onClick={() => onSchedule(run)}
                    style={btnStyle(D.purple)}
                  >
                    ◆ Set Schedule
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 9,
    background: `${color}18`,
    border: `1px solid ${color}35`,
    color: color,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  };
}

// ─── Mini bar chart for engagement over time ──────────────────────────────────
function EngagementSparkline({ runs }: { runs: RunItem[] }) {
  const published = runs.filter(
    (r) => r.feedback_collected && r.engagement.reach > 0,
  );
  if (published.length === 0) return null;

  const maxEng = Math.max(
    ...published.map(
      (r) => r.engagement.likes + r.engagement.comments + r.engagement.shares,
    ),
  );

  return (
    <div
      style={{
        background: D.card,
        border: `1px solid ${D.border}`,
        borderRadius: 14,
        padding: "16px 20px",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          color: D.sub,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Engagement Trend
      </div>
      <div
        style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 50 }}
      >
        {published.slice(-12).map((r, i) => {
          const total =
            r.engagement.likes + r.engagement.comments + r.engagement.shares;
          const h = maxEng > 0 ? Math.max(4, (total / maxEng) * 50) : 4;
          return (
            <div
              key={i}
              style={{ flex: 1, position: "relative" }}
              title={`${total} interactions · ${r.channel}`}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: "easeOut" }}
                style={{
                  background: `linear-gradient(to top, ${D.accent}, ${D.purple})`,
                  borderRadius: "2px 2px 0 0",
                  minHeight: 4,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <span style={{ color: D.dim, fontSize: 9.5 }}>oldest</span>
        <span style={{ color: D.dim, fontSize: 9.5 }}>latest</span>
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────
function CalendarView({ runs }: { runs: RunItem[] }) {
  const scheduled = runs.filter((r) => r.scheduled_time);
  if (scheduled.length === 0) return null;

  const grouped: Record<string, RunItem[]> = {};
  scheduled.forEach((r) => {
    const d = new Date(r.scheduled_time!).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });

  return (
    <div
      style={{
        background: D.card,
        border: `1px solid ${D.border}`,
        borderRadius: 14,
        padding: "16px 20px",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          color: D.sub,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Scheduled Calendar
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(grouped)
          .sort()
          .map(([date, items]) => (
            <div key={date}>
              <div
                style={{
                  color: D.purple,
                  fontSize: 10.5,
                  fontWeight: 700,
                  marginBottom: 5,
                }}
              >
                {date}
              </div>
              {items.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 7,
                    background: `${D.purple}0a`,
                    border: `1px solid ${D.purple}18`,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 10, color: D.purple }}>◆</span>
                  <span
                    style={{
                      flex: 1,
                      color: D.text,
                      fontSize: 11.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.brief}
                  </span>
                  <span style={{ color: D.sub, fontSize: 10, flexShrink: 0 }}>
                    {new Date(r.scheduled_time!).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span style={{ color: D.dim, fontSize: 10, flexShrink: 0 }}>
                    {CHANNEL_ICONS[r.channel] || r.channel}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { companyId, companyName, setRunId } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [scheduleTarget, setScheduleTarget] = useState<RunItem | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const pollRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const d = await fetchDashboard(companyId);
      setData(d);
      setError("");
    } catch (e) {
      setError("Could not load dashboard. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 10000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const handleCollectFeedback = async (runId: string) => {
    setFeedbackLoading(runId);
    try {
      await triggerFeedback(runId);
      showToast("Agent 7 is collecting analytics — refresh in ~10 seconds.");
      setTimeout(load, 8000);
    } catch {
      showToast("Failed to trigger feedback collection.");
    } finally {
      setFeedbackLoading(null);
    }
  };

  const handleSaveSchedule = async (time: string) => {
    if (!scheduleTarget) return;
    await updateSchedule(scheduleTarget.run_id, time);
    showToast("Schedule updated successfully.");
    load();
  };

  const handleGoToPipeline = (runId: string) => {
    setRunId(runId);
    navigate("/pipeline");
  };

  const handleGoToApproval = (runId: string) => {
    setRunId(runId);
    navigate("/approve");
  };

  // Filtered runs
  const runs = data?.runs || [];
  const filteredRuns =
    filter === "all" ? runs : runs.filter((r) => r.status_bucket === filter);

  const FILTERS = [
    { key: "all", label: "All", color: D.sub },
    { key: "drafting", label: "Drafting", color: D.accent },
    { key: "awaiting_approval", label: "Needs Review", color: D.amber },
    { key: "scheduled", label: "Scheduled", color: D.purple },
    { key: "published", label: "Published", color: D.green },
    { key: "failed", label: "Failed", color: D.red },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dashPing { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.7)} }
        @keyframes toastIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .filter-chip:hover { opacity: 0.85; }
        .run-card-btn:hover { opacity: 0.8; transform: scale(1.02); }
      `}</style>

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "'DM Sans', sans-serif",
          animation: "fadeUp 0.5s ease both",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 28,
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
                  background:
                    "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.22))",
                  border: `1px solid rgba(59,130,246,0.28)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                }}
              >
                ◈
              </div>
              <h1
                style={{
                  color: D.text,
                  fontSize: 26,
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: "-0.03em",
                  fontFamily: "'Syne'",
                }}
              >
                Content Dashboard
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
              {companyName ? (
                <>
                  Operations for{" "}
                  <span style={{ color: D.accent }}>{companyName}</span>
                </>
              ) : (
                <span style={{ color: D.red }}>
                  No company loaded — go to Onboarding first
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: `${D.green}14`,
                border: `1px solid ${D.green}28`,
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 11,
                color: D.green,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: D.green,
                  animation: "dashPing 2s infinite",
                }}
              />
              Live · auto-refresh 10s
            </div>
            <button
              onClick={() => navigate("/brief")}
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                border: "none",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(59,130,246,0.3)",
              }}
            >
              + New Content
            </button>
          </div>
        </div>

        {/* ── Loading / Error ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: D.sub }}>
            <div style={{ fontSize: 20, marginBottom: 10 }}>◈</div>
            Loading dashboard…
          </div>
        )}
        {error && (
          <div
            style={{
              background: `${D.red}0a`,
              border: `1px solid ${D.red}22`,
              borderRadius: 10,
              padding: "14px 18px",
              color: "#fca5a5",
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── ROI Impact Strip ── */}
            <ROIImpactStrip companyId={companyId} />
            {/* ── Summary stats ── */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <StatCard
                label="Total Runs"
                value={data.summary.total}
                icon="◈"
              />
              <StatCard
                label="Needs Review"
                value={data.summary.awaiting_approval}
                color={D.amber}
                icon="◉"
              />
              <StatCard
                label="Scheduled"
                value={data.summary.scheduled}
                color={D.purple}
                icon="◆"
              />
              <StatCard
                label="Published"
                value={data.summary.published}
                color={D.green}
                icon="▶"
              />
              <StatCard
                label="Total Reach"
                value={data.engagement_totals.reach.toLocaleString()}
                color={D.cyan}
                icon="◎"
                sub={`${data.engagement_totals.likes} likes · ${data.engagement_totals.shares} shares`}
              />
              <StatCard
                label="Knowledge Docs"
                value={data.knowledge_sources.files}
                color={D.pink}
                icon="◆"
                sub={`${data.knowledge_sources.chunks} chunks`}
              />
            </div>

            {/* ── 2-column layout: left=runs, right=sidebar ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 280px",
                gap: 16,
                alignItems: "start",
              }}
            >
              {/* Left: run list */}
              <div>
                {/* Filter chips */}
                <div
                  style={{
                    display: "flex",
                    gap: 7,
                    marginBottom: 14,
                    flexWrap: "wrap",
                  }}
                >
                  {FILTERS.map((f) => {
                    const count =
                      f.key === "all"
                        ? runs.length
                        : runs.filter((r) => r.status_bucket === f.key).length;
                    const active = filter === f.key;
                    return (
                      <button
                        key={f.key}
                        className="filter-chip"
                        onClick={() => setFilter(f.key)}
                        style={{
                          padding: "5px 13px",
                          borderRadius: 20,
                          border: `1px solid ${active ? f.color : D.border}`,
                          background: active
                            ? `${f.color}18`
                            : "rgba(8,10,22,0.6)",
                          color: active ? f.color : D.sub,
                          fontSize: 11.5,
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        {f.label}
                        <span
                          style={{
                            background: active ? `${f.color}30` : D.border,
                            borderRadius: 10,
                            padding: "1px 6px",
                            fontSize: 10,
                            color: active ? f.color : D.dim,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Run cards */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <AnimatePresence mode="popLayout">
                    {filteredRuns.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                          textAlign: "center",
                          padding: "48px",
                          color: D.dim,
                          fontSize: 13,
                        }}
                      >
                        No runs in this category yet.
                      </motion.div>
                    )}
                    {filteredRuns.map((run) => (
                      <RunCard
                        key={run.run_id}
                        run={run}
                        onSchedule={setScheduleTarget}
                        onCollectFeedback={handleCollectFeedback}
                        onGoToPipeline={handleGoToPipeline}
                        onGoToApproval={handleGoToApproval}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right sidebar */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  position: "sticky",
                  top: 24,
                }}
              >
                <EngagementSparkline runs={runs} />
                <CalendarView runs={runs} />

                {/* Quick stats panel */}
                <div
                  style={{
                    background: D.card,
                    border: `1px solid ${D.border}`,
                    borderRadius: 14,
                    padding: "16px",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <div
                    style={{
                      color: D.sub,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 12,
                    }}
                  >
                    Engagement Summary
                  </div>
                  {[
                    {
                      label: "Total Likes",
                      value: data.engagement_totals.likes,
                      icon: "❤",
                      color: D.red,
                    },
                    {
                      label: "Total Comments",
                      value: data.engagement_totals.comments,
                      icon: "💬",
                      color: D.cyan,
                    },
                    {
                      label: "Total Shares",
                      value: data.engagement_totals.shares,
                      icon: "↗",
                      color: D.green,
                    },
                    {
                      label: "Total Clicks",
                      value: data.engagement_totals.clicks,
                      icon: "👆",
                      color: D.amber,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px 0",
                        borderBottom: `1px solid ${D.border}`,
                      }}
                    >
                      <span style={{ color: D.sub, fontSize: 11.5 }}>
                        {item.icon} {item.label}
                      </span>
                      <span
                        style={{
                          color: item.color,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: D.mono,
                        }}
                      >
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Schedule Modal ── */}
      <AnimatePresence>
        {scheduleTarget && (
          <ScheduleModal
            run={scheduleTarget}
            onClose={() => setScheduleTarget(null)}
            onSave={handleSaveSchedule}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              position: "fixed",
              bottom: 28,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10,13,28,0.95)",
              border: `1px solid ${D.border}`,
              borderRadius: 30,
              padding: "10px 22px",
              color: D.text,
              fontSize: 12.5,
              fontWeight: 600,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              zIndex: 999,
              whiteSpace: "nowrap",
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
