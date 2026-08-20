'use client';

/**
 * Session-scoped brand splash shown once per browser tab session.
 *
 * SSR/hydration: renders nothing until useEffect runs on the client, so the
 * server HTML matches the first client paint (no splash flash / mismatch).
 */
import { BRANDING_NAME } from '@lobechat/business-const';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { ProductLogo } from '@/components/Branding';

export const BRAND_SPLASH_SESSION_KEY = 'wedai_splash_done';

const MIN_DISPLAY_MS = 800;
const MAX_DISPLAY_MS = 2000;
const EXIT_TRANSITION_MS = 320;
const REDUCED_MOTION_DISPLAY_MS = 120;

type SplashPhase = 'idle' | 'visible' | 'exiting' | 'done';

const styles = createStaticStyles(({ css }) => ({
  brandName: css`
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  `,
  content: css`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    justify-content: center;

    animation: wedai-splash-enter 560ms ease forwards;

    @keyframes wedai-splash-enter {
      from {
        transform: scale(0.94);
        opacity: 0;
      }

      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      transform: none;
      opacity: 1;
      animation: none;
    }
  `,
  overlay: css`
    pointer-events: auto;

    position: fixed;
    z-index: 99999;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    color: light-dark(#141414, #f5f5f5);

    background: light-dark(#fafafa, #0d0d0d);

    transition: opacity ${EXIT_TRANSITION_MS}ms ease;

    html[data-theme='light'] & {
      color: #141414;
      background: #fafafa;
    }

    html[data-theme='dark'] & {
      color: #f5f5f5;
      background: #0d0d0d;
    }
  `,
  overlayExit: css`
    pointer-events: none;
    opacity: 0;
  `,
}));

const BrandSplash = memo(() => {
  const [phase, setPhase] = useState<SplashPhase>('idle');
  const finishedRef = useRef(false);
  const shownAtRef = useRef(0);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      sessionStorage.setItem(BRAND_SPLASH_SESSION_KEY, '1');
    } catch {
      // sessionStorage may be unavailable (private mode, blocked storage).
    }

    setPhase('exiting');
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(BRAND_SPLASH_SESSION_KEY)) {
        setPhase('done');
        return;
      }
    } catch {
      setPhase('done');
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    shownAtRef.current = Date.now();
    setPhase('visible');

    const minDisplayMs = reducedMotion ? REDUCED_MOTION_DISPLAY_MS : MIN_DISPLAY_MS;
    const maxDisplayMs = reducedMotion
      ? REDUCED_MOTION_DISPLAY_MS + EXIT_TRANSITION_MS
      : MAX_DISPLAY_MS;

    const minTimer = window.setTimeout(finish, minDisplayMs);
    const maxTimer = window.setTimeout(finish, maxDisplayMs);

    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [finish]);

  useEffect(() => {
    if (phase !== 'exiting') return undefined;

    const fallbackTimer = window.setTimeout(() => {
      setPhase('done');
    }, EXIT_TRANSITION_MS + 80);

    return () => window.clearTimeout(fallbackTimer);
  }, [phase]);

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (phase !== 'exiting' || event.propertyName !== 'opacity') return;
      setPhase('done');
    },
    [phase],
  );

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <div
      aria-hidden={phase === 'exiting'}
      className={phase === 'exiting' ? `${styles.overlay} ${styles.overlayExit}` : styles.overlay}
      role="presentation"
      onTransitionEnd={handleTransitionEnd}
    >
      <div aria-hidden className={styles.content}>
        <ProductLogo size={72} type="flat" />
        <span className={styles.brandName}>{BRANDING_NAME}</span>
      </div>
    </div>
  );
});

BrandSplash.displayName = 'BrandSplash';

export default BrandSplash;
