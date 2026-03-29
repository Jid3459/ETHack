import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Aurora Background (WebGL) ───────────────────────────────────────────────
function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let t = 0,
      animId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const bands = [
      {
        y: 0.12,
        amp: 0.06,
        freq: 0.18,
        ph: 0.0,
        r: 30,
        g: 80,
        b: 200,
        h: 0.32,
      },
      {
        y: 0.28,
        amp: 0.07,
        freq: 0.14,
        ph: 1.2,
        r: 60,
        g: 40,
        b: 220,
        h: 0.28,
      },
      {
        y: 0.45,
        amp: 0.08,
        freq: 0.22,
        ph: 2.1,
        r: 100,
        g: 60,
        b: 240,
        h: 0.3,
      },
      {
        y: 0.62,
        amp: 0.05,
        freq: 0.19,
        ph: 3.0,
        r: 20,
        g: 120,
        b: 210,
        h: 0.25,
      },
      {
        y: 0.78,
        amp: 0.06,
        freq: 0.16,
        ph: 0.7,
        r: 80,
        g: 30,
        b: 200,
        h: 0.22,
      },
    ];
    const draw = () => {
      const w = canvas.width,
        h = canvas.height;
      ctx.fillStyle = "rgba(4,5,12,0.06)";
      ctx.fillRect(0, 0, w, h);
      bands.forEach((b) => {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.35 + b.ph);
        const alpha = 0.035 + pulse * 0.025;
        const cy = h * b.y + h * b.amp * Math.sin(t * b.freq + b.ph);
        const bh = h * (b.h + 0.03 * Math.sin(t * 0.1 + b.ph));
        const grad = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
        grad.addColorStop(0, `rgba(${b.r},${b.g},${b.b},0)`);
        grad.addColorStop(0.5, `rgba(${b.r},${b.g},${b.b},${alpha})`);
        grad.addColorStop(1, `rgba(${b.r},${b.g},${b.b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, cy - bh / 2, w, bh);
        for (let s = 0; s < 3; s++) {
          const sx =
            w * (s / 3) + Math.sin(t * 0.12 + s * 1.8 + b.ph) * w * 0.12;
          const sg = ctx.createRadialGradient(sx, cy, 0, sx, cy, w * 0.25);
          sg.addColorStop(0, `rgba(${b.r},${b.g},${b.b},${alpha * 0.7})`);
          sg.addColorStop(1, `rgba(${b.r},${b.g},${b.b},0)`);
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.ellipse(sx, cy, w * 0.25, bh * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      t += 0.009;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

// ─── Magic Rings (Canvas) ─────────────────────────────────────────────────────
function MagicRings() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let t = 0,
      animId: number;
    const W = 560,
      H = 560;
    canvas.width = W;
    canvas.height = H;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / W - 0.5,
        y: (e.clientY - rect.top) / H - 0.5,
      };
    };
    canvas.addEventListener("mousemove", onMove);
    const rings = [
      {
        r: 0.36,
        speed: 0.38,
        color: "#3b82f6",
        thick: 1.5,
        noise: 0.06,
        phase: 0,
      },
      {
        r: 0.28,
        speed: -0.55,
        color: "#6366f1",
        thick: 1.2,
        noise: 0.09,
        phase: 1.2,
      },
      {
        r: 0.44,
        speed: 0.28,
        color: "#8b5cf6",
        thick: 1.0,
        noise: 0.07,
        phase: 2.1,
      },
      {
        r: 0.2,
        speed: -0.72,
        color: "#06b6d4",
        thick: 0.8,
        noise: 0.12,
        phase: 0.7,
      },
      {
        r: 0.5,
        speed: 0.18,
        color: "#4f46e5",
        thick: 0.7,
        noise: 0.05,
        phase: 3.4,
      },
    ];
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2 + mouseRef.current.x * 30;
      const cy = H / 2 + mouseRef.current.y * 30;
      rings.forEach((ring, ri) => {
        const pts = 180;
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const angle = (i / pts) * Math.PI * 2;
          const wobble =
            1 +
            ring.noise *
              Math.sin(angle * 3 + t * ring.speed + ring.phase + ri) +
            ring.noise *
              0.5 *
              Math.sin(angle * 5 - t * ring.speed * 1.3 + ri * 0.7);
          const r = ((ring.r * Math.min(W, H)) / 2) * wobble;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        const glow = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          ((ring.r * Math.min(W, H)) / 2) * 1.1,
        );
        glow.addColorStop(0, "transparent");
        glow.addColorStop(1, ring.color + "15");
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.strokeStyle = ring.color + "cc";
        ctx.lineWidth = ring.thick;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
      // center orb
      const orb = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
      orb.addColorStop(0, "rgba(99,102,241,0.9)");
      orb.addColorStop(0.4, "rgba(59,130,246,0.5)");
      orb.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.fill();
      t += 0.012;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: 560,
        height: 560,
        opacity: 0.85,
        filter: "drop-shadow(0 0 40px rgba(99,102,241,0.3))",
      }}
    />
  );
}

// ─── Floating Particles (Antigravity-inspired) ────────────────────────────────
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let t = 0,
      animId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      phase: number;
      speed: number;
      cr: number;
      cg: number;
      cb: number;
    }
    const palettes = [
      [59, 130, 246],
      [99, 102, 241],
      [139, 92, 246],
      [6, 182, 212],
      [79, 70, 229],
    ];
    const particles: P[] = Array.from({ length: 120 }, () => {
      const p = palettes[Math.floor(Math.random() * palettes.length)];
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.8 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
        cr: p[0],
        cg: p[1],
        cb: p[2],
      };
    });
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x,
        my = mouseRef.current.y;
      particles.forEach((p) => {
        const dx = p.x - mx,
          dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160 && dist > 0) {
          const f = ((160 - dist) / 160) * 0.3;
          p.vx += (dx / dist) * f;
          p.vy += (dy / dist) * f;
        }
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;
        const bri = 0.2 + 0.8 * Math.abs(Math.sin(t * p.speed + p.phase));
        const r = p.r * (0.6 + 0.5 * bri);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${bri * 0.7})`;
        ctx.fill();
      });
      t += 0.014;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}
    />
  );
}

// ─── Typed tagline ────────────────────────────────────────────────────────────
const TAGLINES = [
  "Brand-safe.",
  "Legally checked.",
  "SEO-optimised.",
  "Multi-lingual.",
  "Human-approved.",
];
function TypedTagline() {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const target = TAGLINES[idx];
    if (!deleting && shown.length < target.length) {
      const t = setTimeout(
        () => setShown(target.slice(0, shown.length + 1)),
        60,
      );
      return () => clearTimeout(t);
    }
    if (!deleting && shown.length === target.length) {
      const t = setTimeout(() => setDeleting(true), 1600);
      return () => clearTimeout(t);
    }
    if (deleting && shown.length > 0) {
      const t = setTimeout(() => setShown(shown.slice(0, -1)), 35);
      return () => clearTimeout(t);
    }
    if (deleting && shown.length === 0) {
      setDeleting(false);
      setIdx((idx + 1) % TAGLINES.length);
    }
  }, [shown, deleting, idx]);
  return (
    <span style={{ color: "#3b82f6", fontWeight: 700 }}>
      {shown}
      <span style={{ animation: "blink 1s step-end infinite", opacity: 0.7 }}>
        |
      </span>
    </span>
  );
}

// ─── Platform logos strip ─────────────────────────────────────────────────────
const PLATFORMS = [
  { name: "LinkedIn", color: "#0077b5", icon: "in" },
  { name: "Twitter", color: "#1da1f2", icon: "𝕏" },
  { name: "Blog", color: "#ff6314", icon: "✍" },
  { name: "Email", color: "#10b981", icon: "✉" },
  { name: "Instagram", color: "#e1306c", icon: "◉" },
  { name: "Press", color: "#8b5cf6", icon: "📰" },
];

// ─── Stats ────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "8", label: "AI Agents", suffix: "" },
  { value: "91", label: "Brand Score", suffix: "%" },
  { value: "6", label: "Languages", suffix: "+" },
  { value: "100", label: "Compliant", suffix: "%" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes scrollX { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes orb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,-40px) scale(1.1)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,50px) scale(1.08)} }
        @keyframes ringFloat { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-16px) rotate(2deg)} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        .cta-primary:hover { transform:translateY(-2px); box-shadow: 0 0 40px rgba(59,130,246,0.5), 0 0 80px rgba(99,102,241,0.2) !important; }
        .cta-secondary:hover { border-color: rgba(99,102,241,0.6) !important; background: rgba(99,102,241,0.1) !important; }
        .feature-card:hover { border-color: rgba(59,130,246,0.4) !important; transform: translateY(-4px); box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 30px rgba(59,130,246,0.1) !important; }
        .platform-pill:hover { transform: scale(1.06); }
      `}</style>

      <AuroraBackground />
      <Particles />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          fontFamily: "'Syne', sans-serif",
          color: "#e8eaf0",
          minHeight: "100vh",
          overflowX: "hidden",
        }}
      >
        {/* ── Nav ── */}
        <nav
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px",
            height: 60,
            background: "rgba(4,5,12,0.6)",
            backdropFilter: "blur(24px)",
            borderBottom: "1px solid rgba(59,130,246,0.1)",
            animation: visible ? "fadeIn 0.6s ease forwards" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: "#fff",
                boxShadow: "0 0 16px rgba(59,130,246,0.5)",
              }}
            >
              ✦
            </div>
            <span
              style={{
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: "-0.01em",
              }}
            >
              ContentShield
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => navigate("/onboard")}
              style={{
                padding: "8px 22px",
                borderRadius: 30,
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                border: "none",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 0 20px rgba(59,130,246,0.35)",
              }}
              className="cta-primary"
            >
              Get Started →
            </button>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            padding: "80px 48px 0",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          {/* Left */}
          <div style={{ flex: "0 0 52%", paddingRight: 48 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 30,
                padding: "5px 14px",
                marginBottom: 28,
                animation: visible ? "fadeUp 0.6s 0.1s ease both" : "none",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  boxShadow: "0 0 8px #3b82f6",
                  animation: "blink 1.5s infinite",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "#93c5fd",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                AI-POWERED CONTENT PIPELINE
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(42px, 5vw, 68px)",
                fontWeight: 800,
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                margin: "0 0 20px",
                animation: visible ? "fadeUp 0.7s 0.2s ease both" : "none",
                textShadow: "none",
              }}
            >
              Content that's
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #06b6d4 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                  backgroundClip: "text",
                  animation: "shimmer 3s linear infinite",
                }}
              >
                always on-brand.
              </span>
            </h1>

            <p
              style={{
                fontSize: 18,
                lineHeight: 1.7,
                color: "#64748b",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 300,
                marginBottom: 16,
                maxWidth: 460,
                animation: visible ? "fadeUp 0.7s 0.3s ease both" : "none",
              }}
            >
              <TypedTagline />
              <br />
              Eight intelligent agents collaborate to generate, validate, and
              publish content that passes every compliance check —
              automatically.
            </p>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 36,
                flexWrap: "wrap",
                animation: visible ? "fadeUp 0.7s 0.45s ease both" : "none",
              }}
            >
              <button
                onClick={() => navigate("/onboard")}
                className="cta-primary"
                style={{
                  padding: "14px 32px",
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, #3b82f6 0%, #6366f1 60%, #8b5cf6 100%)",
                  border: "none",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.25s",
                  boxShadow: "0 0 30px rgba(59,130,246,0.4)",
                  letterSpacing: "0.01em",
                }}
              >
                Start Free →
              </button>
              <button
                onClick={() => navigate("/onboard")}
                className="cta-secondary"
                style={{
                  padding: "14px 28px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#94a3b8",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.25s",
                }}
              >
                ⚡ Load Demo
              </button>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "flex",
                gap: 28,
                marginTop: 52,
                paddingTop: 28,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                animation: visible ? "fadeUp 0.7s 0.55s ease both" : "none",
              }}
            >
              {STATS.map((s) => (
                <div key={s.label}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: "#f0f4ff",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    {s.value}
                    <span style={{ color: "#3b82f6" }}>{s.suffix}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#b2b9ca",
                      marginTop: 4,
                      fontFamily: "'DM Sans'",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Magic Rings */}
          <div
            style={{
              flex: "0 0 48%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              animation: visible ? "fadeIn 1s 0.4s ease both" : "none",
            }}
          >
            <div
              style={{
                animation: "ringFloat 6s ease-in-out infinite",
                position: "relative",
              }}
            >
              <MagicRings />
              {/* Floating labels */}
              {[
                {
                  label: "✓ Brand Passed",
                  color: "#10b981",
                  top: "18%",
                  left: "-8%",
                },
                {
                  label: "⚖ Legal Clear",
                  color: "#f59e0b",
                  top: "72%",
                  left: "-10%",
                },
                {
                  label: "◎ SEO 91/100",
                  color: "#06b6d4",
                  top: "18%",
                  right: "-8%",
                },
                {
                  label: "◉ Human Gate",
                  color: "#8b5cf6",
                  top: "72%",
                  right: "-10%",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    position: "absolute",
                    top: item.top,
                    ...(item.left
                      ? { left: item.left }
                      : { right: item.right }),
                    background: "rgba(8,10,22,0.85)",
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${item.color}35`,
                    borderRadius: 20,
                    padding: "6px 14px",
                    fontSize: 12,
                    color: item.color,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    boxShadow: `0 0 20px ${item.color}15`,
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform logos (scrolling) ── */}
        <section
          style={{
            padding: "60px 0",
            overflow: "hidden",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(4,5,12,0.4)",
            marginTop: 60,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#2a3050",
              textAlign: "center",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
              fontFamily: "'DM Sans'",
            }}
          >
            Publish everywhere, effortlessly
          </div>
          <div style={{ display: "flex", gap: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                gap: 20,
                animation: "scrollX 18s linear infinite",
                flexShrink: 0,
              }}
            >
              {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                <div
                  key={i}
                  className="platform-pill"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 40,
                    padding: "10px 22px",
                    transition: "transform 0.2s",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 16, color: p.color }}>{p.icon}</span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "#e2e8f0",
                      fontWeight: 600,
                      fontFamily: "'DM Sans'",
                    }}
                  >
                    {p.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section
          style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 48px" }}
        >
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2
              style={{
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
              }}
            >
              Eight agents.
              <br />
              One perfect pipeline.
            </h2>
            <p
              style={{
                color: "#e2e8f0",
                fontSize: 16,
                fontFamily: "'DM Sans'",
                fontWeight: 300,
              }}
            >
              Every piece of content passes through a rigorous multi-agent
              workflow before it reaches your audience.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            {[
              {
                icon: "◈",
                label: "Profile Loader",
                desc: "Loads your brand rules, banned words, and tone guidelines",
                color: "#3b82f6",
              },
              {
                icon: "✦",
                label: "AI Drafter",
                desc: "Generates on-brand copy tailored to channel & audience",
                color: "#8b5cf6",
              },
              {
                icon: "⬡",
                label: "Brand Checker",
                desc: "Scores every draft against your brand guidelines in real-time",
                color: "#ef4444",
              },
              {
                icon: "⚖",
                label: "Legal Review",
                desc: "Flags regulatory risks with regulation citations",
                color: "#f59e0b",
              },
              {
                icon: "◎",
                label: "SEO Optimiser",
                desc: "Boosts discoverability with keyword density analysis",
                color: "#06b6d4",
              },
              {
                icon: "◉",
                label: "Human Gate",
                desc: "You approve or reject before anything goes live",
                color: "#10b981",
              },
              {
                icon: "◆",
                label: "Localiser",
                desc: "Translates while preserving brand voice across 6 languages",
                color: "#ec4899",
              },
              {
                icon: "▶",
                label: "Distributor",
                desc: "Publishes across all configured channels simultaneously",
                color: "#14b8a6",
              },
            ].map((f, i) => (
              <div
                key={f.label}
                className="feature-card"
                style={{
                  background: "rgba(8,10,22,0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  padding: "22px",
                  cursor: "default",
                  transition: "all 0.3s",
                  backdropFilter: "blur(12px)",
                  animation: visible
                    ? `fadeUp 0.6s ${0.05 * i + 0.5}s ease both`
                    : "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    marginBottom: 14,
                    background: `${f.color}18`,
                    border: `1px solid ${f.color}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    color: f.color,
                  }}
                >
                  {f.icon}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#e2e8f0",
                  }}
                >
                  {f.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#bfbfc0",
                    lineHeight: 1.6,
                    fontFamily: "'DM Sans'",
                    fontWeight: 300,
                  }}
                >
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section
          style={{ padding: "0 48px 120px", maxWidth: 1280, margin: "0 auto" }}
        >
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.10) 100%)",
              border: "1px solid rgba(59,130,246,0.2)",
              borderRadius: 24,
              padding: "60px",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                width: 600,
                height: 300,
                background:
                  "radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <h2
              style={{
                fontSize: 38,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
                position: "relative",
              }}
            >
              Ready to shield your content?
            </h2>
            <p
              style={{
                color: "#e2e8f0",
                fontFamily: "'DM Sans'",
                fontSize: 16,
                marginBottom: 32,
                position: "relative",
              }}
            >
              Start with the Payzen demo or onboard your own brand in 60
              seconds.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                position: "relative",
              }}
            >
              <button
                onClick={() => navigate("/onboard")}
                className="cta-primary"
                style={{
                  padding: "14px 36px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  border: "none",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.25s",
                  boxShadow: "0 0 30px rgba(59,130,246,0.4)",
                }}
              >
                Launch Pipeline →
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
