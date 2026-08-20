'use client';

/**
 * Session-scoped brand splash shown once per browser tab session.
 *
 * Primary visual: /brand/umm-logo.png (umm brushstroke wordmark).
 *
 * SSR/hydration: renders nothing until useEffect runs on the client, so the
 * server HTML matches the first client paint (no splash flash / mismatch).
 */
import { BRANDING_NAME } from '@lobechat/business-const';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import Image from '@/libs/next/Image';

export const BRAND_SPLASH_SESSION_KEY = 'wedai_splash_done';
export const BRAND_SPLASH_LOGO_SRC = '/brand/umm-logo.png';

/** Optional subtitle under the logo. Set to empty string to hide. */
export const BRAND_SPLASH_SUBTITLE = BRANDING_NAME;

const LOGO_SIZE = 160;

const MIN_DISPLAY_MS = 800;
const MAX_DISPLAY_MS = 2000;
const EXIT_TRANSITION_MS = 320;
const REDUCED_MOTION_DISPLAY_MS = 120;

type SplashPhase = 'idle' | 'visible' | 'exiting' | 'done';

const styles = createStaticStyles(({ css }) => ({
  brandName: css`
    font-size: 0.8125rem;
    font-weight: 500;
    color: light-dark(#737373, #a3a3a3);
    text-transform: uppercase;
    letter-spacing: 0.12em;

    html[data-theme='light'] & {
      color: #737373;
    }

    html[data-theme='dark'] & {
      color: #a3a3a3;
    }
  `,
  content: css`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;

    animation: wedai-splash-enter 560ms ease forwards;

    @keyframes wedai-splash-enter {
      from {
        transform: scale(0.96);
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
  logoFrame: css`
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 12px;

    background: #fafafa;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 4%);

    html[data-theme='dark'] & {
      background: #fafafa;
      box-shadow: 0 8px 32px rgb(0 0 0 / 35%);
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

    background: light-dark(#fff, #111);

    transition: opacity ${EXIT_TRANSITION_MS}ms ease;

    html[data-theme='light'] & {
      background: #fff;
    }

    html[data-theme='dark'] & {
      background: #111;
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
        <div className={styles.logoFrame}>
          <Image
            priority
            unoptimized
            alt="umm"
            height={LOGO_SIZE}
            src={BRAND_SPLASH_LOGO_SRC}
            style={{ display: 'block', height: LOGO_SIZE, objectFit: 'contain', width: LOGO_SIZE }}
            width={LOGO_SIZE}
            onError={finish}
          />
        </div>
        {BRAND_SPLASH_SUBTITLE ? (
          <span className={styles.brandName}>{BRAND_SPLASH_SUBTITLE}</span>
        ) : null}
      </div>
    </div>
  );
});

BrandSplash.displayName = 'BrandSplash';

export default BrandSplash;
