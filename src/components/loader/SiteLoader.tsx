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

const MAX_LOCK_MS = 11000; // safety net: the page can never stay locked past this
const MIN_INTRO_MS = 5000; // minimum cinematic screen time (kept in sync with CSS)
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

      {/* Crosshair frame */}
      <div className={styles.scene} aria-hidden="true">
        <span className={styles.crosshairH} />
        <span className={styles.crosshairV} />

        {/* Phase 1 — the three disciplines */}
        <span className={`${styles.word} ${styles.wDesign}`}>DESIGN</span>
        <span className={`${styles.word} ${styles.wData}`}>DATA</span>
        <span className={`${styles.word} ${styles.wAi}`}>AI</span>

        {/* Phase 2 — connecting lines converge on the core */}
        <svg
          className={styles.connect}
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
        >
          <line className={styles.connLine} x1="150" y1="300" x2="490" y2="280" stroke="#b44dff" strokeWidth="1" opacity="0.6" />
          <line className={styles.connLine} x1="150" y1="300" x2="490" y2="300" stroke="#b44dff" strokeWidth="1" opacity="0.35" />
          <line className={styles.connLine} x1="500" y1="300" x2="500" y2="285" stroke="#4d9fff" strokeWidth="1" opacity="0.6" />
          <line className={styles.connLine} x1="850" y1="300" x2="510" y2="280" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
          <line className={styles.connLine} x1="850" y1="300" x2="510" y2="320" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
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
