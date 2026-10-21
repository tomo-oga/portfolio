// Mobile navigation
const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");

navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open);
});

navLinks.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", false);
    }
});

// Contact form: submit to Formspree without leaving the page
const form = document.getElementById("contact-form");
const formStatus = document.getElementById("form-status");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formStatus.textContent = "Sending…";
    try {
        const res = await fetch(form.action, {
            method: "POST",
            body: new FormData(form),
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(res.statusText);
        form.reset();
        formStatus.textContent = "Thanks! I'll get back to you soon.";
    } catch {
        formStatus.textContent = "Something went wrong. Please email me directly.";
    }
});

// Hero animation: a molecule becomes a graph, passes messages, and is read out to an embedding
(() => {
    const canvas = document.getElementById("molecule-canvas");
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Hand-laid 2D coordinates (unit bond length). Bonds are [a, b, order, ring center for an inner double-bond line].
    const hexRing = [[0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]];
    const benzene = (c) => [[0, 1, 2, c], [1, 2, 1], [2, 3, 2, c], [3, 4, 1], [4, 5, 2, c], [5, 0, 1]];
    const origin = { x: 0, y: 0 };

    const molecules = [
        {
            name: "caffeine", formula: "C₈H₁₀N₄O₂",
            atoms: [
                ["N", -0.866, -0.5], ["C", -0.866, 0.5], ["N", 0, 1], ["C", 0.866, 0.5], ["C", 0.866, -0.5],
                ["C", 0, -1], ["N", 1.817, -0.809], ["C", 2.405, 0], ["N", 1.817, 0.809], ["O", 0, -2],
                ["O", -1.732, 1], ["C", -1.732, -1], ["C", 0, 2], ["C", 2.126, -1.76],
            ],
            bonds: [
                [0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2, { x: 1.554, y: 0 }], [4, 5, 1], [5, 0, 1],
                [4, 6, 1], [6, 7, 1], [7, 8, 2, { x: 1.554, y: 0 }], [8, 3, 1],
                [5, 9, 2], [1, 10, 2], [0, 11, 1], [2, 12, 1], [6, 13, 1],
            ],
        },
        {
            name: "aspirin", formula: "C₉H₈O₄",
            atoms: [
                ...hexRing.map(([x, y]) => ["C", x, y]),
                ["C", 1.732, -1], ["O", 1.732, -2], ["OH", 2.598, -0.5],
                ["O", 1.732, 1], ["C", 1.732, 2], ["O", 0.866, 2.5], ["C", 2.598, 2.5],
            ],
            bonds: [
                ...benzene(origin),
                [1, 6, 1], [6, 7, 2], [6, 8, 1], [2, 9, 1], [9, 10, 1], [10, 11, 2], [10, 12, 1],
            ],
        },
        {
            name: "dopamine", formula: "C₈H₁₁NO₂",
            atoms: [
                ...hexRing.map(([x, y]) => ["C", x, y]),
                ["C", 1.732, -1], ["C", 2.598, -0.5], ["NH₂", 3.464, -1],
                ["HO", -1.732, 1], ["HO", -1.732, -1],
            ],
            bonds: [...benzene(origin), [1, 6, 1], [6, 7, 1], [7, 8, 1], [4, 9, 1], [5, 10, 1]],
        },
    ];

    // Center each molecule and give it a deterministic "embedding"
    for (const m of molecules) {
        const xs = m.atoms.map((a) => a[1]), ys = m.atoms.map((a) => a[2]);
        m.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        m.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        m.span = Math.max(Math.max(...xs) - Math.min(...xs) + 1.2, (Math.max(...ys) - Math.min(...ys) + 1) * 1.6);
        let seed = [...m.name].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
        const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
        m.embedding = Array.from({ length: 32 }, () => (rand() * 2 - 1) * (0.35 + 0.65 * rand()));
    }

    // Per-molecule timeline (seconds)
    const BUILD = [0.2, 1.4];
    const LAYERS = 3, MP_START = 1.7, LAYER = 0.9;
    const POOL = [MP_START + LAYERS * LAYER + 0.2, MP_START + LAYERS * LAYER + 0.9];
    const READOUT = [POOL[1], POOL[1] + 0.9];
    const FADE = [7.0, 7.6];
    const PERIOD = 7.8;

    let W = 0, H = 0;
    let lastT = reduceMotion ? 6 : 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        W = rect.width;
        H = rect.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(lastT);
    }

    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const ease = (v) => 1 - Math.pow(1 - clamp01(v), 3);
    const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });

    function colors() {
        const s = getComputedStyle(document.documentElement);
        const v = (name) => s.getPropertyValue(name).trim();
        return {
            surface: v("--surface"), text: v("--text"), muted: v("--muted"), faint: v("--faint"),
            line: v("--line"), accent: v("--accent"), N: v("--nitrogen"), O: v("--oxygen"),
        };
    }

    function line(a, b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    function dot(p, r) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    function draw(T) {
        const m = molecules[Math.floor(T / PERIOD) % molecules.length];
        const t = T % PERIOD;
        const c = colors();
        const fade = 1 - ease((t - FADE[0]) / (FADE[1] - FADE[0]));
        const pad = Math.max(20, W * 0.07);
        const mono = (size) => `${size}px "IBM Plex Mono", ui-monospace, monospace`;
        const mpLevel = clamp01((t - MP_START) / (LAYERS * LAYER)) * LAYERS;
        const layer = Math.floor(mpLevel);

        ctx.clearRect(0, 0, W, H);

        // Status readout
        let status = "molecule → graph";
        if (t >= MP_START && layer < LAYERS) status = `message passing · layer ${layer + 1}/${LAYERS}`;
        else if (t >= MP_START) status = "readout → embedding";
        ctx.globalAlpha = 1;
        ctx.font = mono(Math.max(11, W * 0.024));
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillStyle = c.accent;
        ctx.fillText("●", pad, pad * 0.7);
        ctx.fillStyle = c.muted;
        ctx.fillText(status, pad + W * 0.04, pad * 0.7);
        ctx.textAlign = "right";
        ctx.globalAlpha = fade;
        ctx.fillStyle = c.faint;
        ctx.fillText(`${m.name} · ${m.formula}`, W - pad, pad * 0.7);

        // Molecule geometry
        const bond = Math.min((W - pad * 2) / m.span, W * 0.11);
        const cx = W / 2, cy = H * 0.42;
        const sway = reduceMotion ? 0 : Math.sin(T * 0.6) * 0.035;
        const cos = Math.cos(sway), sin = Math.sin(sway);
        const pos = (x, y) => {
            const dx = x - m.cx, dy = y - m.cy;
            return { x: cx + (dx * cos - dy * sin) * bond, y: cy + (dx * sin + dy * cos) * bond };
        };
        const P = m.atoms.map(([, x, y]) => pos(x, y));
        const step = (BUILD[1] - BUILD[0]) / m.atoms.length;
        const appear = (i) => ease((t - (BUILD[0] + i * step)) / 0.3);

        // Bonds
        ctx.globalAlpha = fade;
        ctx.strokeStyle = c.text;
        ctx.lineWidth = Math.max(1.5, bond * 0.045);
        ctx.lineCap = "round";
        for (const [a, b, order, ring] of m.bonds) {
            const [i, j] = a < b ? [a, b] : [b, a];
            const g = appear(j);
            if (g <= 0) continue;
            const A = P[i], B = lerp(A, P[j], g);
            line(A, B);
            if (order !== 2) continue;
            const off = bond * 0.16;
            if (ring) {
                const R = pos(ring.x, ring.y);
                const mid = lerp(A, P[j], 0.5);
                const d = Math.hypot(R.x - mid.x, R.y - mid.y);
                const o = { x: ((R.x - mid.x) / d) * off, y: ((R.y - mid.y) / d) * off };
                const a2 = lerp(A, B, 0.15), b2 = lerp(A, B, 0.85);
                line({ x: a2.x + o.x, y: a2.y + o.y }, { x: b2.x + o.x, y: b2.y + o.y });
            } else {
                const len = Math.hypot(P[j].x - A.x, P[j].y - A.y);
                const o = { x: (-(P[j].y - A.y) / len) * off, y: ((P[j].x - A.x) / len) * off };
                line({ x: A.x + o.x, y: A.y + o.y }, { x: B.x + o.x, y: B.y + o.y });
            }
        }

        // Label backgrounds knock out bond lines behind heteroatoms
        const fontSize = Math.round(bond * 0.36);
        ctx.font = `500 ${fontSize}px "IBM Plex Sans", system-ui, sans-serif`;
        ctx.fillStyle = c.surface;
        m.atoms.forEach(([el], i) => {
            if (el === "C" || appear(i) <= 0) return;
            const w = ctx.measureText(el).width + fontSize * 0.4;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.roundRect(P[i].x - w / 2, P[i].y - fontSize * 0.6, w, fontSize * 1.2, fontSize * 0.6);
            ctx.fill();
        });

        // Node halos grow with each message-passing layer
        ctx.fillStyle = c.accent;
        P.forEach((p, i) => {
            if (mpLevel <= 0) return;
            ctx.globalAlpha = fade * 0.055 * mpLevel * appear(i);
            dot(p, bond * (0.16 + 0.05 * mpLevel));
        });

        // Messages travel along every bond in both directions
        if (t >= MP_START && layer < LAYERS) {
            const p = (mpLevel - layer);
            ctx.fillStyle = c.accent;
            ctx.globalAlpha = fade * Math.sin(Math.PI * p);
            for (const [a, b] of m.bonds) {
                dot(lerp(P[a], P[b], ease(p)), bond * 0.065);
                dot(lerp(P[b], P[a], ease(p)), bond * 0.065);
            }
        }

        // Atoms: carbons are implicit vertices, heteroatoms are labeled
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        m.atoms.forEach(([el], i) => {
            const g = appear(i);
            if (g <= 0) return;
            const p = P[i];
            ctx.globalAlpha = fade * g;
            if (el === "C") {
                ctx.fillStyle = c.accent;
                if (g < 1) dot(p, bond * 0.09 * (1.6 - g));
                return;
            }
            ctx.fillStyle = el.includes("N") ? c.N : c.O;
            ctx.fillText(el, p.x, p.y + 1);
        });

        // Embedding strip
        const x0 = pad, x1 = W - pad;
        const zero = H * 0.84, amp = H * 0.075;
        const n = m.embedding.length, cell = (x1 - x0) / n;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 1;
        line({ x: x0, y: zero + 0.5 }, { x: x1, y: zero + 0.5 });
        ctx.font = mono(Math.max(10, W * 0.02));
        ctx.fillStyle = c.faint;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("h ∈ ℝ³²", x0, zero + amp + 8);

        // Pooling: every node sends its state down to the readout
        const pool = (t - POOL[0]) / (POOL[1] - POOL[0]);
        if (pool > 0 && pool < 1) {
            ctx.fillStyle = c.accent;
            ctx.globalAlpha = fade * Math.sin(Math.PI * pool);
            P.forEach((p, i) => {
                const target = { x: x0 + (i / (P.length - 1)) * (x1 - x0), y: zero };
                dot(lerp(p, target, ease(pool)), bond * 0.06);
            });
        }

        m.embedding.forEach((v, k) => {
            const g = ease((t - READOUT[0] - (k / n) * (READOUT[1] - READOUT[0]) * 0.6) / 0.35);
            if (g <= 0) return;
            ctx.globalAlpha = fade * (0.35 + 0.65 * Math.abs(v));
            ctx.fillStyle = v > 0 ? c.accent : c.muted;
            const h = v * amp * g;
            ctx.fillRect(x0 + k * cell + cell * 0.15, h > 0 ? zero - h : zero, cell * 0.7, Math.abs(h));
        });
        ctx.globalAlpha = 1;
    }

    resize();
    window.addEventListener("resize", resize);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => draw(lastT));
    if (reduceMotion) return;

    let visible = true;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);

    const start = performance.now();
    function frame(now) {
        if (visible) {
            lastT = ((now - start) / 1000) % (PERIOD * molecules.length);
            draw(lastT);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
