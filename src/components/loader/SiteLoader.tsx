'use client';

/* ════════════════════════════════════════════════════════════════════════
   KHANSTRUCT — Neural Formation intro (home only)
   ────────────────────────────────────────────────────────────────────────
   A single CSS-driven cinematic: a faint crosshair frames three disciplines
   (DESIGN · DATA · AI) that light up, connect, then collapse into the K mark
   and the KHANSTRUCT brand lockup. The reveal is one CSS timeline (each
   element self-schedules via animation-delay — no per-frame JS).

   Orchestration (this file) only governs the boundaries:
     • lock scroll before first paint (home route only, basePath-aware)
     • hold for MIN_INTRO_MS while real assets (fonts + paint) settle
     • on exit, MORPH the brand lockup toward the header logo's measured
       position, hand off to the hero (store.introDone), unlock + unmount.
   Reduced-motion users get a static mark and a quick handoff.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useExperience } from '@/store/experience';
import styles from './SiteLoader.module.css';

const MAX_LOCK_MS = 12000; // safety net: the page can never stay locked past this
const MIN_INTRO_MS = 6500; // minimum cinematic screen time (kept in sync with CSS)
const REDUCED_MS = 600; // reduced-motion: short static hold

type LoaderMode = 'full' | 'reduced';
type LoaderPhase = 'intro' | 'exit';

/** matchMedia guarded for SSR. */
function mq(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

/** True when the current URL is the site root (basePath-aware). */
function isHomePath(): boolean {
  if (typeof window === 'undefined') return false;
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === base;
}

export function SiteLoader() {
  const setIntroDone = useExperience((s) => s.setIntroDone);

  const [show, setShow] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [mode, setMode] = useState<LoaderMode>('full');
  const [phase, setPhase] = useState<LoaderPhase>('intro');
  const [isMobile, setIsMobile] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);

  /* ── Decide mode + lock scroll BEFORE first paint (home only, no flash). ── */
  useLayoutEffect(() => {
    if (!isHomePath()) {
      setShow(false); // non-home: remove the SSR'd overlay before it paints
      return;
    }
    const reduced = mq('(prefers-reduced-motion: reduce)');
    setMode(reduced ? 'reduced' : 'full');
    setIsMobile(mq('(max-width: 640px)'));

    document.documentElement.classList.add('loader-active');
    document.body.classList.add('is-loading');
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  /* ── Orchestrate the boundaries. Runs once; own controller for StrictMode. ── */
  useEffect(() => {
    if (!isHomePath()) return;

    const controller = new AbortController();
    const { signal } = controller;
    const timers: number[] = [];

    const reduced = mq('(prefers-reduced-motion: reduce)');
    const small = mq('(max-width: 640px)');
    const sp = small ? 0.9 : 1.0;
    const minMs = reduced ? REDUCED_MS : MIN_INTRO_MS;
    const exitMs = reduced ? 360 : Math.round(820 * sp);

    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : start);

    /** Real readiness — fonts + a paint frame — so the page is ready when shown. */
    const preload = (): Promise<void> => {
      const tasks: Promise<unknown>[] = [];
      if (typeof document !== 'undefined' && 'fonts' in document) {
        tasks.push(document.fonts.ready.catch(() => undefined));
      }
      tasks.push(
        new Promise<void>((res) =>
          requestAnimationFrame(() => requestAnimationFrame(() => res())),
        ),
      );
      const softCap = new Promise<void>((res) => window.setTimeout(res, 2600));
      return Promise.race([Promise.all(tasks).then(() => undefined), softCap]);
    };

    let assetsReady = false;
    preload().then(() => {
      assetsReady = true;
    });

    /** Restore the page: unlock scroll, return focus, drop the loader. */
    const completeLoader = () => {
      document.documentElement.classList.remove('loader-active');
      document.body.classList.remove('is-loading');
      const main = document.getElementById('main-content');
      if (main) {
        try {
          main.focus({ preventScroll: true });
        } catch {
          main.focus();
        }
      }
      setMounted(false);
    };

    /** Measure the header logo and aim the brand lockup at it (the morph). */
    const aimMorphAtLogo = () => {
      if (reduced) return;
      const logo = document.querySelector<HTMLElement>('[data-site-logo]');
      const lockup = lockupRef.current;
      if (!logo || !lockup) return;
      const lr = logo.getBoundingClientRect();
      const br = lockup.getBoundingClientRect();
      if (lr.height <= 0 || br.height <= 0) return;
      const scale = Math.max(0.08, lr.height / br.height);
      const dx = lr.left + lr.width / 2 - (br.left + br.width / 2);
      const dy = lr.top + lr.height / 2 - (br.top + br.height / 2);
      lockup.style.setProperty('--mx', `${dx}px`);
      lockup.style.setProperty('--my', `${dy}px`);
      lockup.style.setProperty('--ms', `${scale}`);
      lockup.dataset.morph = 'true';
    };

    let exited = false;
    const beginExit = () => {
      if (exited) return;
      exited = true;
      aimMorphAtLogo();
      setPhase('exit');
      // Hero entrance begins under the morph (single run, no flash).
      timers.push(window.setTimeout(() => setIntroDone(true), Math.round(140 * sp)));
      timers.push(
        window.setTimeout(() => {
          window.clearTimeout(hardStop);
          completeLoader();
        }, exitMs),
      );
    };

    // Gate: hand off only once real assets are ready AND the cinematic has had
    // its minimum screen time. Polls lightly (no rAF loop) until both are true.
    const gate = () => {
      if (signal.aborted) return;
      if (assetsReady && nowMs() - start >= minMs) {
        beginExit();
        return;
      }
      timers.push(window.setTimeout(gate, 80));
    };

    // Hard safety net: force the page open no matter what.
    const hardStop = window.setTimeout(() => {
      controller.abort();
      beginExit();
    }, MAX_LOCK_MS);

    gate();

    return () => {
      controller.abort();
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(hardStop);
      // If torn down mid-run, never leave the page locked.
      document.documentElement.classList.remove('loader-active');
      document.body.classList.remove('is-loading');
    };
  }, [setIntroDone]);

  if (!show || !mounted) return null;

  return (
    <div
      ref={rootRef}
      id="site-loader"
      className={styles.loader}
      data-mode={mode}
      data-phase={phase}
      data-mobile={isMobile ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      aria-label="Loading Khanstruct"
      tabIndex={-1}
    >
      <span className={styles.srOnly}>Loading Khanstruct — system initialization.</span>

      {/* Deep backdrop — fades on exit to reveal the page beneath */}
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      {/* Box → network → brain → simplify — a white-on-black vector morph */}
      <div className={styles.scene} aria-hidden="true">
        <svg className={styles.diagram} viewBox="0 0 400 400" fill="none">
          {/* Stage 1–2 — the box appears, then unfolds outward */}
          <path className={styles.box} pathLength={1} d="M150 150 H250 V250 H150 Z" />

          {/* Stage 3–4 — organic branches + nodes grow from the core */}
          <g className={styles.network}>
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.20s' }} d="M200 200 Q188 168 200 126" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.28s' }} d="M200 200 Q150 168 134 150" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.36s' }} d="M200 200 Q250 168 266 150" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.44s' }} d="M200 200 Q142 196 126 200" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.52s' }} d="M200 200 Q258 196 274 200" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.60s' }} d="M200 200 Q162 240 156 258" />
            <path className={styles.netLine} pathLength={1} style={{ ['--d' as string]: '1.68s' }} d="M200 200 Q238 240 244 258" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '1.70s' }} cx="200" cy="126" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '1.78s' }} cx="134" cy="150" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '1.86s' }} cx="266" cy="150" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '1.94s' }} cx="126" cy="200" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '2.02s' }} cx="274" cy="200" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '2.10s' }} cx="156" cy="258" r="3.4" />
            <circle className={styles.netNode} style={{ ['--d' as string]: '2.18s' }} cx="244" cy="258" r="3.4" />
            <circle className={styles.netNodeCore} style={{ ['--d' as string]: '1.60s' }} cx="200" cy="200" r="4" />
          </g>

          {/* Stage 5–7 — the network resolves into a brain with inner activity */}
          <g className={styles.brain}>
            <path className={styles.brainOutline} pathLength={1} style={{ ['--d' as string]: '2.30s' }} d="M200 120 C160 112 132 132 132 160 C112 166 110 196 130 206 C124 236 150 266 200 262 C250 266 276 236 270 206 C290 196 288 166 268 160 C268 132 240 112 200 120 Z" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '2.80s' }} d="M200 124 C192 150 208 168 200 194 C192 218 208 242 200 260" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '2.90s' }} d="M150 150 C166 156 168 172 152 180" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '3.00s' }} d="M134 196 C152 200 154 216 136 222" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '3.10s' }} d="M158 232 C170 236 172 250 156 254" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '2.90s' }} d="M250 150 C234 156 232 172 248 180" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '3.00s' }} d="M266 196 C248 200 246 216 264 222" />
            <path className={styles.brainFold} pathLength={1} style={{ ['--d' as string]: '3.10s' }} d="M242 232 C230 236 228 250 244 254" />
            <path className={styles.activity} pathLength={1} style={{ ['--d' as string]: '3.50s' }} d="M168 200 C186 182 214 218 232 200" />
            <path className={styles.activity} pathLength={1} style={{ ['--d' as string]: '3.65s' }} d="M184 224 C196 212 204 232 216 224" />
          </g>

          {/* Stage 8 — short rays radiate outward (growth / interconnection) */}
          <g className={styles.radiate}>
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '3.90s' }} x1="200" y1="120" x2="200" y2="96" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '3.98s' }} x1="132" y1="150" x2="112" y2="130" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '4.06s' }} x1="268" y1="150" x2="288" y2="130" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '4.14s' }} x1="120" y1="200" x2="96" y2="200" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '4.22s' }} x1="280" y1="200" x2="304" y2="200" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '4.30s' }} x1="155" y1="258" x2="138" y2="280" />
            <line className={styles.ray} pathLength={1} style={{ ['--d' as string]: '4.38s' }} x1="245" y1="258" x2="262" y2="280" />
          </g>
        </svg>
      </div>

      {/* Phase 3 — formation: K + glow + brand (this lockup morphs to the logo) */}
      <div ref={lockupRef} className={styles.lockup} aria-hidden="true">
        <svg className={styles.kmark} viewBox="0 0 60 76">
          <path className={styles.kStroke} pathLength={1} d="M14 8 L14 68" />
          <path className={styles.kStroke} pathLength={1} d="M14 42 L50 8" />
          <path className={styles.kStroke} pathLength={1} d="M14 42 L52 68" />
          <circle className={styles.kJoint} cx="14" cy="42" r="3.2" />
        </svg>
        <span className={styles.glowDot} />
        <h1 className={styles.brandName}>KHANSTRUCT</h1>
        <p className={styles.brandSub}>SYSTEM INITIALIZATION</p>
      </div>
    </div>
  );
}
