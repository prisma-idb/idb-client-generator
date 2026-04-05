"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw, RefreshCw } from "lucide-react";

const MOBILE_DELAY = 12.5;
const TRANSFER_WINDOW = 1; // seconds the dot animation plays before mobile starts
const TRANSFER_START = MOBILE_DELAY - TRANSFER_WINDOW;
const TRIM_END = 4; // stop playback this many seconds before the raw video ends

const CHAPTERS = [
  { start: 0, label: "Make offline changes" },
  { start: 5.75, label: "Resilient sync" },
  { start: MOBILE_DELAY, label: "Cross-device consistency" },
] as const;

function getChapter(time: number) {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (time >= CHAPTERS[i].start) return CHAPTERS[i];
  }
  return CHAPTERS[0];
}

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-100 shadow-2xl dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900/80">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>
        <div className="mx-auto flex items-center rounded-md bg-zinc-200 px-3 py-0.5 dark:bg-zinc-800">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">kanban.prisma-idb.dev</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-50 overflow-hidden rounded-4xl border-4 border-zinc-700 bg-zinc-950 shadow-2xl">
      <div className="mx-auto h-5 w-20 rounded-b-xl bg-zinc-800" />
      {children}
    </div>
  );
}

const TRANSFER_DOTS = 8;
const TRANSFER_DURATION = 0.9; // seconds per dot cycle (keep ~= TRANSFER_WINDOW for smooth flow)

function SyncTransfer({ syncing, transferring }: { syncing: boolean; transferring: boolean }) {
  return (
    <div className="hidden items-center self-center lg:flex">
      <div className="relative flex h-8 w-28 items-center justify-center">
        {/* Flowing dots */}
        {transferring && (
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: TRANSFER_DOTS }).map((_, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                style={{
                  backgroundColor: i % 2 === 0 ? "hsl(32, 100%, 50%)" : "hsl(200, 100%, 60%)",
                  animation: `dot-flow ${TRANSFER_DURATION}s ease-in-out ${i * (TRANSFER_DURATION / TRANSFER_DOTS)}s infinite`,
                }}
              />
            ))}
          </div>
        )}
        {/* Center icon */}
        <RefreshCw
          className={`relative z-10 h-5 w-5 transition-all duration-500 ${
            syncing ? "animate-spin text-[hsl(32,100%,50%)]" : "text-zinc-500"
          }`}
        />
      </div>
    </div>
  );
}

export function DemoPlayer() {
  const desktopRef = useRef<HTMLVideoElement>(null);
  const mobileRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [desktopDuration, setDesktopDuration] = useState(0);
  const [isLg, setIsLg] = useState(true); // default to lg to avoid flash
  const syncing = currentTime >= 9.5 && currentTime <= MOBILE_DELAY;
  const transferring = currentTime >= TRANSFER_START && currentTime <= MOBILE_DELAY;
  const hasAutoPlayed = useRef(false);
  const mobileAutoStartBlocked = useRef(false);

  const startMobile = useCallback(async () => {
    const mobile = mobileRef.current;
    if (!mobile) return;
    try {
      await mobile.play();
    } catch {
      mobileAutoStartBlocked.current = true;
    }
  }, []);

  // Detect screen size
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    handler({ matches: mql.matches } as MediaQueryListEvent);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const tick = useCallback(() => {
    const desktop = desktopRef.current;
    if (desktop && desktop.duration > 0 && !Number.isNaN(desktop.duration)) {
      const effectiveDuration = desktop.duration - TRIM_END;
      const clampedTime = Math.min(desktop.currentTime, effectiveDuration);
      setProgress(clampedTime / effectiveDuration);
      setCurrentTime(clampedTime);
      setDesktopDuration(effectiveDuration);
      if (desktop.currentTime >= effectiveDuration) {
        desktop.pause();
        setPlaying(false);
        setEnded(true);
        setProgress(1);
      }
    }
  }, []);

  // Catch already-loaded metadata (fires before hydration with preload="auto")
  useEffect(() => {
    const desktop = desktopRef.current;
    if (desktop && desktop.duration > 0 && !Number.isNaN(desktop.duration)) {
      setDesktopDuration(desktop.duration - TRIM_END);
    }
  }, []);

  // Autoplay on desktop when scrolled into view
  useEffect(() => {
    const container = containerRef.current;
    const desktop = desktopRef.current;
    if (!container || !desktop) return;

    // Only autoplay on desktop-width screens (lg breakpoint)
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAutoPlayed.current) {
          hasAutoPlayed.current = true;
          desktop
            .play()
            .then(() => setPlaying(true))
            .catch(() => {});
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // RAF loop — always running while playing
  useEffect(() => {
    if (!playing) return;
    let id: number;
    const loop = () => {
      tick();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, tick]);

  // Start mobile video when desktop reaches MOBILE_DELAY
  useEffect(() => {
    const desktop = desktopRef.current;
    const mobile = mobileRef.current;
    if (!desktop || !mobile) return;

    const onTimeUpdate = () => {
      if (
        desktop.currentTime >= MOBILE_DELAY &&
        mobile.paused &&
        !mobile.ended &&
        playing &&
        !mobileAutoStartBlocked.current
      ) {
        startMobile();
      }
    };

    desktop.addEventListener("timeupdate", onTimeUpdate);
    return () => desktop.removeEventListener("timeupdate", onTimeUpdate);
  }, [playing, startMobile]);

  // When desktop ends
  useEffect(() => {
    const desktop = desktopRef.current;
    if (!desktop) return;

    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
      setProgress(1);
    };

    desktop.addEventListener("ended", onEnded);
    return () => desktop.removeEventListener("ended", onEnded);
  }, []);

  const seek = (fraction: number) => {
    const desktop = desktopRef.current;
    const mobile = mobileRef.current;
    if (!desktop || !mobile || desktopDuration === 0) return;

    const time = Math.min(fraction * desktopDuration, desktopDuration);
    desktop.currentTime = time;
    setProgress(fraction);
    setCurrentTime(time);
    setEnded(false);

    if (time >= MOBILE_DELAY) {
      mobile.currentTime = time - MOBILE_DELAY;
      if (playing) startMobile();
    } else {
      mobile.currentTime = 0;
      mobile.pause();
      mobileAutoStartBlocked.current = false;
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(fraction);
  };

  const playPause = () => {
    const desktop = desktopRef.current;
    const mobile = mobileRef.current;
    if (!desktop || !mobile) return;

    if (playing) {
      desktop.pause();
      mobile.pause();
      setPlaying(false);
    } else {
      if (ended) {
        restart();
        return;
      }
      desktop
        .play()
        .then(() => {
          if (desktop.currentTime >= MOBILE_DELAY) {
            mobileAutoStartBlocked.current = false;
            startMobile();
          }
          setPlaying(true);
        })
        .catch(() => setPlaying(false));
    }
  };

  const restart = () => {
    const desktop = desktopRef.current;
    const mobile = mobileRef.current;
    if (!desktop || !mobile) return;

    desktop.currentTime = 0;
    mobile.currentTime = 0;
    mobile.pause();
    mobileAutoStartBlocked.current = false;
    setProgress(0);
    setCurrentTime(0);
    setEnded(false);
    desktop
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  const chapter = getChapter(currentTime);

  // On small screens, show desktop first, then switch to phone at MOBILE_DELAY
  const showPhoneOnMobile = !isLg && currentTime >= MOBILE_DELAY;

  return (
    <div ref={containerRef}>
      {isLg ? (
        /* Large screens: desktop + sync animation + phone side by side */
        <div className="flex items-end justify-center gap-6">
          <div className="max-w-2xl flex-1">
            <BrowserFrame>
              <div className="bg-zinc-950">
                <video
                  ref={desktopRef}
                  src="/demo-desktop.mp4"
                  className="h-full w-full"
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => setDesktopDuration(e.currentTarget.duration - TRIM_END)}
                />
              </div>
            </BrowserFrame>
          </div>

          <SyncTransfer syncing={syncing} transferring={transferring} />

          <div className="shrink-0">
            <PhoneFrame>
              <video ref={mobileRef} src="/demo-mobile.mp4" className="w-full" muted playsInline preload="auto" />
            </PhoneFrame>
          </div>
        </div>
      ) : (
        /* Small screens: desktop in browser frame first, then phone after MOBILE_DELAY */
        <div>
          <div className={showPhoneOnMobile ? "hidden" : "block"}>
            <BrowserFrame>
              <div className="bg-zinc-950">
                <video
                  ref={desktopRef}
                  src="/demo-desktop.mp4"
                  className="h-full w-full"
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => setDesktopDuration(e.currentTarget.duration - TRIM_END)}
                />
              </div>
            </BrowserFrame>
          </div>

          {syncing && !showPhoneOnMobile && (
            <div className="flex justify-center py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-[hsl(32,100%,50%)]" />
            </div>
          )}

          <div className={showPhoneOnMobile ? "flex justify-center" : "hidden"}>
            <PhoneFrame>
              <video ref={mobileRef} src="/demo-mobile.mp4" className="w-full" muted playsInline preload="auto" />
            </PhoneFrame>
          </div>
        </div>
      )}

      {/* Chapter + Controls */}
      <div className="mx-auto mt-6 max-w-md">
        <div className="mb-2 h-5 text-center">
          <p
            key={chapter.label}
            className="animate-slide-in text-fd-muted-foreground text-sm font-medium tracking-wide"
          >
            {chapter.label}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={playPause}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
            aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : ended ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-px" />
            )}
          </button>

          {/* Progress bar */}
          <div
            ref={progressBarRef}
            role="slider"
            tabIndex={0}
            aria-label="Demo progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-zinc-800"
            onClick={handleProgressBarClick}
            onKeyDown={(e) => {
              const step = 0.05;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                seek(Math.min(1, progress + step));
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                seek(Math.max(0, progress - step));
              }
            }}
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[hsl(32,100%,50%)]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <button
            onClick={restart}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
            aria-label="Restart"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
