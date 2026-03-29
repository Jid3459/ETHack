import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * KnowledgeUploader
 * ─────────────────
 * Drop this into BriefInput.tsx, above the brief textarea.
 *
 * Usage inside BriefInput.tsx:
 *   import KnowledgeUploader from './KnowledgeUploader'
 *   ...
 *   <KnowledgeUploader companyId={companyId} />
 *
 * What it does:
 *   - Lets user drag-drop or click-to-upload PDF/DOCX/CSV/TXT/MD
 *   - Calls POST /ingest/{company_id} (multipart/form-data)
 *   - Shows chunk count + success state
 *   - Lists already-ingested documents via GET /ingest/{company_id}
 *   - Agent 1 automatically uses this knowledge on the next run
 */

const BASE = "http://localhost:8000";

const D = {
  card: "rgba(8,10,22,0.78)",
  border: "rgba(255,255,255,0.1)",
  accent: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  text: "#eef0f8",
  sub: "#9aaac4", // was '#64748b'
  dim: "#5a6a8a", // was '#2a3050'
  mono: "'JetBrains Mono', monospace",
};

const ACCEPTED = ".pdf,.docx,.csv,.txt,.md";
const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  csv: "📊",
  txt: "📃",
  md: "📋",
};

interface IngestedDoc {
  source_file: string;
  file_type: string;
  chunks: number;
}

interface UploadState {
  status: "idle" | "uploading" | "success" | "error";
  fileName?: string;
  chunks?: number;
  error?: string;
}

export default function KnowledgeUploader({
  companyId,
}: {
  companyId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [docs, setDocs] = useState<IngestedDoc[]>([]);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing docs
  const loadDocs = async () => {
    if (!companyId) return;
    try {
      const r = await fetch(`${BASE}/ingest/${companyId}`);
      const d = await r.json();
      setDocs(d.documents || []);
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    if (expanded) loadDocs();
  }, [expanded, companyId]);

  const handleFile = async (file: File) => {
    if (!companyId) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "csv", "txt", "md"].includes(ext)) {
      setUpload({
        status: "error",
        error: `Unsupported format .${ext}. Use PDF, DOCX, CSV, TXT, or MD.`,
      });
      return;
    }

    setUpload({ status: "uploading", fileName: file.name });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("source_name", file.name);

    try {
      const r = await fetch(`${BASE}/ingest/${companyId}`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data = await r.json();
      setUpload({
        status: "success",
        fileName: file.name,
        chunks: data.chunks_stored,
      });
      await loadDocs();
      // Auto-reset after 4s
      setTimeout(() => setUpload({ status: "idle" }), 4000);
    } catch (e: any) {
      setUpload({ status: "error", error: e.message || "Upload failed" });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const docCount = docs.length;
  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Collapsed toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              flexShrink: 0,
              background: "rgba(139,92,246,0.18)",
              border: "1px solid rgba(139,92,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            ◆
          </div>
          <span style={{ color: D.text, fontSize: 12.5, fontWeight: 700 }}>
            Knowledge Base
          </span>
          {docCount > 0 && (
            <span
              style={{
                background: "rgba(139,92,246,0.14)",
                border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: 12,
                padding: "2px 9px",
                fontSize: 10.5,
                color: "#a78bfa",
                fontWeight: 700,
              }}
            >
              {docCount} doc{docCount !== 1 ? "s" : ""} · {totalChunks} chunks
            </span>
          )}
          {docCount === 0 && (
            <span style={{ color: D.dim, fontSize: 11 }}>
              Upload docs → Agent 1 uses them to enrich drafts
            </span>
          )}
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          style={{
            color: D.dim,
            fontSize: 10,
            display: "inline-block",
            flexShrink: 0,
          }}
        >
          ▾
        </motion.span>
      </button>

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
                background: D.card,
                border: `1px solid rgba(139,92,246,0.2)`,
                borderRadius: 12,
                padding: "16px",
                marginBottom: 6,
                backdropFilter: "blur(10px)",
              }}
            >
              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? "#8b5cf6" : upload.status === "success" ? D.green : "rgba(139,92,246,0.3)"}`,
                  borderRadius: 10,
                  padding: "20px",
                  textAlign: "center",
                  cursor: upload.status === "uploading" ? "wait" : "pointer",
                  transition: "all 0.2s",
                  background: dragging
                    ? "rgba(139,92,246,0.08)"
                    : upload.status === "success"
                      ? "rgba(16,185,129,0.06)"
                      : "rgba(4,5,12,0.5)",
                  marginBottom: 12,
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  onChange={onInputChange}
                  style={{ display: "none" }}
                />

                {upload.status === "idle" && (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>
                      {dragging ? "📥" : "📂"}
                    </div>
                    <div
                      style={{
                        color: "#a78bfa",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {dragging
                        ? "Drop to upload"
                        : "Drop a document or click to browse"}
                    </div>
                    <div style={{ color: D.dim, fontSize: 11 }}>
                      PDF · DOCX · CSV · TXT · MD
                    </div>
                  </>
                )}

                {upload.status === "uploading" && (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>⚙️</div>
                    <div
                      style={{
                        color: "#a78bfa",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Indexing {upload.fileName}…
                    </div>
                    <div style={{ color: D.dim, fontSize: 11 }}>
                      Chunking · Embedding · Storing in Qdrant
                    </div>
                    {/* Progress bar animation */}
                    <div
                      style={{
                        marginTop: 12,
                        height: 3,
                        background: D.border,
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <motion.div
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          ease: "linear",
                        }}
                        style={{
                          height: "100%",
                          width: "40%",
                          background: "#8b5cf6",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </div>
                )}

                {upload.status === "success" && (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
                    <div
                      style={{
                        color: D.green,
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      {upload.fileName} indexed
                    </div>
                    <div style={{ color: D.sub, fontSize: 11 }}>
                      {upload.chunks} chunks stored · Agent 1 will use this on
                      next run
                    </div>
                  </div>
                )}

                {upload.status === "error" && (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
                    <div
                      style={{
                        color: D.red,
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Upload failed
                    </div>
                    <div style={{ color: D.sub, fontSize: 11 }}>
                      {upload.error}
                    </div>
                    <div
                      style={{ color: "#a78bfa", fontSize: 11, marginTop: 6 }}
                    >
                      Click to try again
                    </div>
                  </div>
                )}
              </div>

              {/* Ingested docs list */}
              {docs.length > 0 && (
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
                    Indexed documents
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 5 }}
                  >
                    {docs.map((doc, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "7px 11px",
                          borderRadius: 8,
                          background: "rgba(4,5,12,0.6)",
                          border: `1px solid ${D.border}`,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>
                          {FILE_ICONS[doc.file_type] || "📄"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            color: D.text,
                            fontSize: 12,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {doc.source_file}
                        </span>
                        <span
                          style={{
                            background: "rgba(139,92,246,0.12)",
                            border: "1px solid rgba(139,92,246,0.2)",
                            borderRadius: 10,
                            padding: "1px 7px",
                            fontSize: 10,
                            color: "#a78bfa",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {doc.chunks} chunks
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How it works */}
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.15)",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 12, flexShrink: 0 }}>💡</span>
                <span style={{ color: D.dim, fontSize: 11, lineHeight: 1.6 }}>
                  Upload a product spec, press release, or internal report.
                  Agent 1 queries these documents before drafting — your content
                  will include accurate product details, real metrics, and
                  internal positioning that the LLM alone cannot know.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
