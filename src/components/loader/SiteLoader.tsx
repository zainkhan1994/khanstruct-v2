'use client';

/* ════════════════════════════════════════════════════════════════════════
   KHANSTRUCT — intro (home only)
   ────────────────────────────────────────────────────────────────────────
   Plays the supplied Lottie animation full-screen on a fresh load of the
   home route, then hands off to the page. Orchestration only governs the
   boundaries:
     • lock scroll before first paint (home route only, basePath-aware)
     • play the Lottie once; on complete (or a safety cap) fade out, hand off
       to the hero (store.introDone), unlock scroll + unmount
   Reduced-motion users skip the animation and go straight to the page.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import { useExperience } from '@/store/experience';
import styles from './SiteLoader.module.css';
import introData from './introLottie.json';

const MAX_LOCK_MS = 12000; // safety net: the page can never stay locked past this

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
  const [phase, setPhase] = useState<LoaderPhase>('intro');

  const rootRef = useRef<HTMLDivElement>(null);
  const exitedRef = useRef(false);

  /* ── Lock scroll BEFORE first paint (home only, no flash). ── */
  useLayoutEffect(() => {
    if (!isHomePath()) {
      setShow(false); // non-home: remove the SSR'd overlay before it paints
      return;
    }
    document.documentElement.classList.add('loader-active');
    document.body.classList.add('is-loading');
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  /* ── Restore the page: unlock scroll, return focus, drop the loader. ── */
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

  /* ── Hand off: fade out, signal the hero, then unmount. ── */
  const beginExit = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    setIntroDone(true);
    setPhase('exit');
    window.setTimeout(completeLoader, 600); // matches the exit fade in CSS
  };

  /* ── Safety net + reduced-motion shortcut. ── */
  useEffect(() => {
    if (!isHomePath()) return;

    // Reduced motion: skip the animation, hand off promptly.
    if (mq('(prefers-reduced-motion: reduce)')) {
      const t = window.setTimeout(beginExit, 200);
      return () => window.clearTimeout(t);
    }

    // Force the page open if the animation stalls or onComplete never fires.
    const hardStop = window.setTimeout(beginExit, MAX_LOCK_MS);
    return () => window.clearTimeout(hardStop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show || !mounted) return null;

  return (
    <div
      ref={rootRef}
      id="site-loader"
      className={styles.loader}
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label="Loading Khanstruct"
      tabIndex={-1}
    >
      <span className={styles.srOnly}>Loading Khanstruct.</span>
      <div className={styles.backdrop} aria-hidden="true" />
      <Lottie
        animationData={introData}
        loop={false}
        autoplay
        onComplete={beginExit}
        className={styles.lottie}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
        aria-hidden="true"
      />
    </div>
  );
}
