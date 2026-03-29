import { useEffect, useRef } from "react";

function Galaxy() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -9999, y: -9999 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let t = 0;
        let animId: number;

        interface Star {
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

        const palettes = [
            [59, 130, 246],
            [99, 102, 241],
            [139, 92, 246],
            [6, 182, 212],
            [168, 85, 247],
            [220, 228, 255],
        ];
        const stars: Star[] = Array.from({ length: 260 }, () => {
            const p = palettes[Math.floor(Math.random() * palettes.length)];
            return {
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: (Math.random() - 0.5) * 0.06,
                vy: (Math.random() - 0.5) * 0.06,
                r: Math.random() * 1.6 + 0.2,
                phase: Math.random() * Math.PI * 2,
                speed: 0.6 + Math.random() * 2,
                cr: p[0],
                cg: p[1],
                cb: p[2],
            };
        });

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.fillStyle = "rgba(6,8,15,0.18)";
            ctx.fillRect(0, 0, w, h);
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            stars.forEach((s) => {
                const dx = s.x - mx;
                const dy = s.y - my;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 140 && dist > 0) {
                    const f = ((140 - dist) / 140) * 0.25;
                    s.vx += (dx / dist) * f;
                    s.vy += (dy / dist) * f;
                }
                s.vx *= 0.97;
                s.vy *= 0.97;
                s.x += s.vx;
                s.y += s.vy;
                if (s.x < -10) s.x = w + 10;
                if (s.x > w + 10) s.x = -10;
                if (s.y < -10) s.y = h + 10;
                if (s.y > h + 10) s.y = -10;
                const bri =
                    0.25 + 0.75 * Math.abs(Math.sin(t * s.speed + s.phase));
                const r = s.r * (0.7 + 0.5 * bri);
                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${s.cr},${s.cg},${s.cb},${bri * 0.9})`;
                ctx.fill();
                if (bri > 0.65) {
                    const g = ctx.createRadialGradient(
                        s.x,
                        s.y,
                        0,
                        s.x,
                        s.y,
                        r * 5,
                    );
                    g.addColorStop(
                        0,
                        `rgba(${s.cr},${s.cg},${s.cb},${bri * 0.25})`,
                    );
                    g.addColorStop(1, `rgba(${s.cr},${s.cg},${s.cb},0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, r * 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            const nebulae = [
                { x: 0.15, y: 0.3, r: 0.28, cr: 59, cg: 130, cb: 246 },
                { x: 0.85, y: 0.7, r: 0.24, cr: 139, cg: 92, cb: 246 },
                { x: 0.5, y: 0.15, r: 0.2, cr: 6, cg: 182, cb: 212 },
            ];
            nebulae.forEach((n) => {
                const nx = w * n.x + Math.sin(t * 0.08 + n.x * 3) * w * 0.04;
                const ny = h * n.y + Math.cos(t * 0.06 + n.y * 3) * h * 0.04;
                const nr = Math.min(w, h) * n.r;
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
                ng.addColorStop(0, `rgba(${n.cr},${n.cg},${n.cb},0.025)`);
                ng.addColorStop(1, `rgba(${n.cr},${n.cg},${n.cb},0)`);
                ctx.fillStyle = ng;
                ctx.fillRect(0, 0, w, h);
            });

            t += 0.016;
            animId = requestAnimationFrame(draw);
        };

        ctx.fillStyle = "#06080f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
            }}
        />
    );
}

export default Galaxy;
