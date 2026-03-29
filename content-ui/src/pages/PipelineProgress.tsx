import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StatusResponse, AgentName } from "../types";
import Galaxy from "../components/reactbits/Galaxy";
import { getStatus } from "../api/client";

// ─── Pipeline Logic ───────────────────────────────────────────────────────────
const AGENTS: {
  key: AgentName;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "profile_loader",
    label: "Profile Loader",
    description: "Loading company brand profile",
    icon: "◈",
  },
  {
    key: "agent1_drafter",
    label: "Content Drafter",
    description: "Generating content draft",
    icon: "✦",
  },
  {
    key: "agent2_quality_guardian",
    label: "Brand Compliance",
    description: "Checking brand guidelines",
    icon: "⬡",
  },
  {
    key: "agent3_legal_reviewer",
    label: "Legal Review",
    description: "Checking regulatory compliance",
    icon: "⚖",
  },
  {
    key: "human_gate",
    label: "Human Approval",
    description: "Awaiting your review",
    icon: "◉",
  },
  {
    key: "agent4_localizer",
    label: "Localisation",
    description: "Translating to target languages",
    icon: "◆",
  },
  {
    key: "agent5_distributor",
    label: "Distribution",
    description: "Publishing to channels",
    icon: "▶",
  },
];
type CardState = "pending" | "active" | "passed" | "failed" | "waiting";
interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: "info" | "success" | "warn" | "error" | "system";
}

function getCardState(key: AgentName, s: StatusResponse): CardState {
  const cur = s.current_node;
  if (key === "agent2_quality_guardian") {
    if (cur === "agent2_quality_guardian")
      return s.brand_passed === false && s.brand_score !== null
        ? "failed"
        : "active";
    if (s.brand_passed) return "passed";
  }
  if (key === "agent3_legal_reviewer") {
    if (cur === "agent3_legal_reviewer") return "active";
    if (s.legal_passed) return "passed";
  }
  if (key === "human_gate") {
    if (s.status === "awaiting_human") return "waiting";
    if (s.pipeline_complete) return "passed";
  }
  if (cur === key) return "active";
  const order = AGENTS.map((a) => a.key);
  const ci = order.indexOf(cur as AgentName);
  const ai = order.indexOf(key);
  if (s.pipeline_complete) return "passed";
  if (ci > ai) return "passed";
  return "pending";
}

const CFG: Record<
  CardState,
  {
    bg: string;
    border: string;
    dot: string;
    label: string;
    glow: string;
    text: string;
  }
> = {
  active: {
    bg: "rgba(59,130,246,0.11)",
    border: "#3b82f6",
    dot: "#3b82f6",
    label: "#93c5fd",
    glow: "0 0 24px rgba(59,130,246,0.3)",
    text: "Running…",
  },
  passed: {
    bg: "rgba(34,197,94,0.07)",
    border: "#22c55e",
    dot: "#22c55e",
    label: "#86efac",
    glow: "0 0 16px rgba(34,197,94,0.18)",
    text: "Passed ✓",
  },
  failed: {
    bg: "rgba(239,68,68,0.09)",
    border: "#ef4444",
    dot: "#ef4444",
    label: "#fca5a5",
    glow: "0 0 20px rgba(239,68,68,0.22)",
    text: "Needs revision",
  },
  waiting: {
    bg: "rgba(245,158,11,0.09)",
    border: "#f59e0b",
    dot: "#f59e0b",
    label: "#fcd34d",
    glow: "0 0 20px rgba(245,158,11,0.22)",
    text: "Awaiting you",
  },
  pending: {
    bg: "rgba(12,14,24,0.55)",
    border: "#1a1f30",
    dot: "#1a1f30",
    label: "#2a3050",
    glow: "none",
    text: "Pending",
  },
};

const LC: Record<LogEntry["type"], { c: string; bar: string; bg: string }> = {
  info: { c: "#60a5fa", bar: "#3b82f6", bg: "rgba(59,130,246,0.06)" },
  success: { c: "#4ade80", bar: "#22c55e", bg: "rgba(34,197,94,0.06)" },
  warn: { c: "#fbbf24", bar: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
  error: { c: "#f87171", bar: "#ef4444", bg: "rgba(239,68,68,0.06)" },
  system: { c: "#a78bfa", bar: "#8b5cf6", bg: "rgba(139,92,246,0.06)" },
};

function classify(m: string): LogEntry["type"] {
  if (m.includes("complete") || m.includes("passed") || m.includes("published"))
    return "success";
  if (m.includes("violation") || m.includes("FAIL") || m.includes("error"))
    return "error";
  if (m.includes("flag") || m.includes("revision") || m.includes("Revision"))
    return "warn";
  if (m.includes("paused") || m.includes("human")) return "system";
  return "info";
}

function PulseDot({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: 10,
        height: 10,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: 0.35,
          animation: "ppPing 1.4s cubic-bezier(0,0,0.2,1) infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export default function PipelineProgress() {
  const navigate = useNavigate();
  const { runId, companyName } = useApp();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logCounter = useRef(0);

  const passedCount = status
    ? AGENTS.filter((a) => getCardState(a.key, status) === "passed").length
    : 0;
  const progress = Math.round((passedCount / AGENTS.length) * 100);

  useEffect(() => {
    const add = (msg: string) => {
      const type = classify(msg);
      setLogs((prev) =>
        [
          {
            id: logCounter.current++,
            time: new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            msg,
            type,
          },
          ...prev,
        ].slice(0, 60),
      );
    };
    let isFetching = false;
    const poll = async () => {
      if (!runId) return;
      if (isFetching) return;
      isFetching = true;
      try {
        const s = await getStatus(runId);
        setStatus(s);
        if (s.current_node) add(`Agent ${s.current_node} — ${s.status}`);
        if (s.revision_count > 0 && s.current_node === "agent1_drafter")
          add(
            `Revision ${s.revision_count} triggered — fixing brand violations`,
          );
        if (s.brand_passed && s.current_node === "agent2_quality_guardian")
          add(`Brand score: ${s.brand_score}/100 — passed`);
        if (s.status === "awaiting_human")
          add("Pipeline paused — human review required");
        if (s.status === "complete")
          add("Pipeline complete — content published");
        if (
          s.status === "awaiting_human" ||
          s.status === "complete" ||
          s.status === "error"
        )
          clearInterval(id);
      } finally {
        isFetching = false;
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [runId]);
  useEffect(() => {
    if (status?.status === "awaiting_human")
      setTimeout(() => navigate("/approve"), 1500);
  }, [status?.status, navigate]);
  if (!runId || !status) {
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
  const revisionActive =
    status?.current_node === "agent1_drafter" &&
    (status?.revision_count ?? 0) > 0;

  return (
    <>
      <Galaxy />
      <style>{`
        @keyframes ppPing { 75%,100%{transform:scale(2.5);opacity:0;} }
        @keyframes ppSlide { from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:translateY(0);} }
        .pp-log{animation:ppSlide 0.22s ease forwards;}
        .pp-card{transition:box-shadow 0.3s,border-color 0.3s;}
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1100,
          margin: "0 auto",
          paddingBottom: 40,
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: 28,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
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
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  boxShadow: "0 0 12px #3b82f6",
                  animation: status?.pipeline_complete
                    ? "none"
                    : "ppPing 1.5s ease infinite",
                }}
              />
              <h1
                style={{
                  color: "#f0f4ff",
                  fontSize: 26,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Pipeline Running
              </h1>
            </div>
            <p
              style={{
                color: "#ddddef",
                fontSize: 14,
                margin: 0,
              }}
            >
              {companyName ? (
                <>
                  Processing for{" "}
                  <span
                    style={{
                      color: "#3b82f6",
                      fontWeight: 600,
                    }}
                  >
                    {companyName}
                  </span>
                </>
              ) : (
                "Processing content through the agent pipeline…"
              )}
            </p>
          </div>
          <div
            style={{
              background: "rgba(10,12,22,0.75)",
              backdropFilter: "blur(12px)",
              border: "1px solid #1a1f30",
              borderRadius: 50,
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 38,
                height: 38,
              }}
            >
              <svg
                width="38"
                height="38"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle
                  cx="19"
                  cy="19"
                  r="15"
                  fill="none"
                  stroke="#1a1f30"
                  strokeWidth="3"
                />
                <circle
                  cx="19"
                  cy="19"
                  r="15"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 15}`}
                  strokeDashoffset={`${2 * Math.PI * 15 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-dashoffset 0.6s ease",
                  }}
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#93c5fd",
                }}
              >
                {progress}%
              </div>
            </div>
            <div>
              <div
                style={{
                  color: "#e2e8f0",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {passedCount}/{AGENTS.length} agents
              </div>
              <div style={{ color: "#ddddef", fontSize: 11 }}>
                {status?.pipeline_complete
                  ? "Complete"
                  : status?.status === "awaiting_human"
                    ? "Awaiting approval"
                    : "In progress"}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 2,
            background: "#1a1f30",
            borderRadius: 2,
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg,#3b82f6,#8b5cf6)",
              transition: "width 0.6s ease",
              boxShadow: "0 0 10px rgba(59,130,246,0.7)",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 295px",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Agent cards */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            {AGENTS.map((agent, idx) => {
              const state = status
                ? getCardState(agent.key, status)
                : "pending";
              const cfg = CFG[state];
              const isBrandFailed =
                agent.key === "agent2_quality_guardian" && state === "failed";
              return (
                <React.Fragment key={agent.key}>
                  <div
                    className="pp-card"
                    style={{
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: 11,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      boxShadow:
                        state === "active" || state === "waiting"
                          ? cfg.glow
                          : "none",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        background:
                          state === "pending" ? "#0a0d18" : `${cfg.border}20`,
                        border: `1px solid ${state === "pending" ? "#1a1f30" : cfg.border}`,
                        color: state === "pending" ? "#abbae4" : cfg.label,
                      }}
                    >
                      {state === "passed" ? "✓" : idx + 1}
                    </div>
                    {state === "active" || state === "waiting" ? (
                      <PulseDot color={cfg.dot} />
                    ) : (
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: cfg.dot,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 14,
                        color: cfg.label,
                        flexShrink: 0,
                        opacity: state === "pending" ? 0.15 : 1,
                      }}
                    >
                      {agent.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: state === "pending" ? "#2a3050" : "#e2e8f0",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {agent.label}
                      </div>
                      <div
                        style={{
                          color: "#bdbdbd",
                          fontSize: 11,
                          marginTop: 1,
                        }}
                      >
                        {agent.description}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {agent.key === "agent2_quality_guardian" &&
                        status?.brand_score != null && (
                          <span
                            style={{
                              background:
                                status.brand_score >= 0.8
                                  ? "rgba(34,197,94,0.15)"
                                  : "rgba(239,68,68,0.15)",
                              color:
                                status.brand_score >= 0.8
                                  ? "#86efac"
                                  : "#fca5a5",
                              border: `1px solid ${status.brand_score >= 0.8 ? "#22c55e30" : "#ef444430"}`,
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {status.brand_score * 100}/100
                          </span>
                        )}
                      {agent.key === "agent3_legal_reviewer" &&
                        (status?.legal_flags_count ?? 0) > 0 && (
                          <span
                            style={{
                              background: "rgba(245,158,11,0.15)",
                              color: "#fcd34d",
                              border: "1px solid rgba(245,158,11,0.3)",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {status?.legal_flags_count} flag
                            {(status?.legal_flags_count ?? 0) > 1 ? "s" : ""}
                          </span>
                        )}
                      {agent.key === "agent1_drafter" &&
                        (status?.revision_count ?? 0) > 0 && (
                          <span
                            style={{
                              background: "rgba(59,130,246,0.15)",
                              color: "#93c5fd",
                              border: "1px solid rgba(59,130,246,0.3)",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Rev {status?.revision_count}
                          </span>
                        )}
                      <span
                        style={{
                          color: cfg.label,
                          fontSize: 11,
                          fontWeight: 500,
                          minWidth: 78,
                          textAlign: "right",
                        }}
                      >
                        {cfg.text}
                      </span>
                    </div>
                  </div>
                  {isBrandFailed && revisionActive && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 14px",
                        background: "rgba(239,68,68,0.05)",
                        border: "1px dashed rgba(239,68,68,0.3)",
                        borderRadius: 7,
                        fontSize: 11,
                        color: "#fca5a5",
                        marginLeft: 18,
                      }}
                    >
                      ↺ Brand violation — routing back to Content Drafter for
                      revision
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {status?.pipeline_complete && (
              <div
                style={{
                  background: "rgba(34,197,94,0.07)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  borderRadius: 12,
                  padding: "18px 20px",
                  textAlign: "center",
                  boxShadow: "0 0 30px rgba(34,197,94,0.1)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    color: "#4ade80",
                    fontSize: 24,
                    marginBottom: 4,
                  }}
                >
                  ✓
                </div>
                <div
                  style={{
                    color: "#86efac",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Content published successfully
                </div>
                <div
                  style={{
                    color: "#2a3050",
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  All agents completed
                </div>
              </div>
            )}
          </div>

          {/* Live log */}
          <div
            style={{
              background: "rgba(6,8,15,0.88)",
              backdropFilter: "blur(16px)",
              border: "1px solid #1a1f30",
              borderRadius: 12,
              overflow: "hidden",
              position: "sticky",
              top: 24,
              maxHeight: 510,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "9px 13px",
                borderBottom: "1px solid #1a1f30",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(20,24,40,0.6)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#22c55e",
                    boxShadow: "0 0 6px #22c55e",
                    animation: status?.pipeline_complete
                      ? "none"
                      : "ppPing 1.5s ease infinite",
                  }}
                />
                <span
                  style={{
                    color: "#ddddef",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  LIVE LOG
                </span>
              </div>
              <span
                style={{
                  color: "#1a1f30",
                  fontSize: 9,
                  fontFamily: "monospace",
                }}
              >
                {logs.length} entries
              </span>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "6px 0",
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              {logs.length === 0 && (
                <div
                  style={{
                    color: "#1a1f30",
                    fontSize: 11,
                    fontFamily: "monospace",
                    padding: "8px 13px",
                  }}
                >
                  Waiting for pipeline…
                </div>
              )}
              {logs.map((entry, i) => {
                const lc = LC[entry.type];
                return (
                  <div
                    key={entry.id}
                    className="pp-log"
                    style={{
                      display: "flex",
                      gap: 7,
                      alignItems: "flex-start",
                      padding: "4px 13px",
                      background: i === 0 ? lc.bg : "transparent",
                      borderLeft: `2px solid ${i === 0 ? lc.bar : "transparent"}`,
                    }}
                  >
                    <span
                      style={{
                        color: "#1e2538",
                        fontSize: 9,
                        fontFamily: "monospace",
                        flexShrink: 0,
                        marginTop: 1,
                        minWidth: 52,
                      }}
                    >
                      {entry.time}
                    </span>
                    <span
                      style={{
                        color: i === 0 ? lc.c : "#2a3050",
                        fontSize: 10,
                        fontFamily: "monospace",
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                      }}
                    >
                      {entry.msg}
                    </span>
                  </div>
                );
              })}
            </div>
            {status?.draft_preview && (
              <div
                style={{
                  borderTop: "1px solid #1a1f30",
                  padding: "9px 13px",
                  background: "rgba(139,92,246,0.04)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    color: "#3a2a60",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    marginBottom: 5,
                  }}
                >
                  DRAFT PREVIEW
                </div>
                <div
                  style={{
                    color: "#3a2a60",
                    fontSize: 10,
                    fontStyle: "italic",
                    lineHeight: 1.6,
                    fontFamily: "monospace",
                  }}
                >
                  {status.draft_preview.slice(0, 150)}
                  {status.draft_preview.length > 150 ? "…" : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
