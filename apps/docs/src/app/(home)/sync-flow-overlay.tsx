"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Pencil,
  Cloud,
  CloudOff,
  CheckCircle2,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Inbox,
  ScrollText,
  Database,
} from "lucide-react";

// ─── Timeline (desktop video seconds) ───────────────────────────────
const OUTBOX_EVENTS = [
  { id: "create-pen", at: 3, op: "CREATE" as const, model: "Todo", title: "Pen", icon: Plus },
  { id: "update-bread", at: 4, op: "UPDATE" as const, model: "Todo", title: "Bread → done", icon: Pencil },
  { id: "update-milk", at: 4.5, op: "UPDATE" as const, model: "Todo", title: "Milk → done", icon: Pencil },
];

const SYNC_FAIL_AT = 7;
const SYNC_START_AT = 9.5;
const SYNC_DONE_AT = 10;

// Mobile video starts at MOBILE_DELAY (12.5s desktop time)
const MOBILE_DELAY = 12.5;
const PULL_TRIGGER_AT = MOBILE_DELAY + 3.5;
const PULL_EVENTS_AT = MOBILE_DELAY + 3.75;
const PULL_DONE_AT = MOBILE_DELAY + 4;

const CHANGELOG_EVENTS = [
  { id: "cl-1", model: "Todo", op: "CREATE" as const, title: "Pen" },
  { id: "cl-2", model: "Todo", op: "UPDATE" as const, title: "Bread → done" },
  { id: "cl-3", model: "Todo", op: "UPDATE" as const, title: "Milk → done" },
];

// ─── Badge colors ────────────────────────────────────────────────────
const OP_STYLES = {
  CREATE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  UPDATE: "bg-sky-500/20 text-sky-400 border-sky-500/30",
} as const;

// ─── Shared event card ───────────────────────────────────────────────
function EventCard({
  op,
  model,
  title,
  icon: Icon,
  size = "normal",
}: {
  op: "CREATE" | "UPDATE";
  model: string;
  title: string;
  icon: typeof Plus;
  size?: "normal" | "small";
}) {
  const isSmall = size === "small";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900/80 backdrop-blur ${
        isSmall ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      <Icon className={`shrink-0 text-zinc-400 ${isSmall ? "h-2.5 w-2.5" : "h-3 w-3"}`} />
      <span
        className={`rounded border leading-none font-semibold ${OP_STYLES[op]} ${
          isSmall ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]"
        }`}
      >
        {op}
      </span>
      <span className={isSmall ? "text-zinc-300" : "text-zinc-300"}>
        <span className="text-zinc-500">{model}</span> {title}
      </span>
    </div>
  );
}

// ─── Desktop Outbox Panel (static, always rendered) ──────────────────

export function DesktopSyncOverlay({ currentTime }: { currentTime: number }) {
  const syncPhase = useMemo<"idle" | "failing" | "syncing" | "done">(() => {
    if (currentTime >= SYNC_DONE_AT) return "done";
    if (currentTime >= SYNC_START_AT) return "syncing";
    if (currentTime >= SYNC_FAIL_AT) return "failing";
    return "idle";
  }, [currentTime]);

  const outboxCleared = currentTime >= SYNC_DONE_AT;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {/* Header — always visible */}
      <div
        className={`flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase transition-colors duration-500 ${
          outboxCleared ? "text-emerald-400" : "text-zinc-500"
        }`}
      >
        <Inbox className="h-3 w-3" />
        <span>Outbox</span>
        <AnimatePresence mode="wait">
          {!outboxCleared && OUTBOX_EVENTS.some((e) => currentTime >= e.at) && (
            <motion.span
              key="count"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400"
            >
              {OUTBOX_EVENTS.filter((e) => currentTime >= e.at).length}
            </motion.span>
          )}
          {outboxCleared && (
            <motion.span
              key="check"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CheckCircle2 className="ml-1 h-3 w-3 text-emerald-400" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Cards — slide in / slide out */}
      <AnimatePresence>
        {OUTBOX_EVENTS.map(
          (event) =>
            currentTime >= event.at &&
            !outboxCleared && (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, height: 0, y: 8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, x: 40, transition: { duration: 0.4, ease: "easeInOut" } }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <EventCard op={event.op} model={event.model} title={event.title} icon={event.icon} />
              </motion.div>
            )
        )}
      </AnimatePresence>

      {/* Sync status */}
      <AnimatePresence mode="wait">
        {syncPhase !== "idle" && (
          <motion.div
            key={syncPhase}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <SyncStatusBadge phase={syncPhase} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Central Server (lg only) ────────────────────────────────────────

type ServerPhase = "idle" | "push-fail" | "pushing" | "stored" | "pulling" | "pull-done";

export function CentralServer({ currentTime }: { currentTime: number }) {
  const phase = useMemo<ServerPhase>(() => {
    if (currentTime >= PULL_DONE_AT) return "pull-done";
    if (currentTime >= PULL_TRIGGER_AT) return "pulling";
    if (currentTime >= SYNC_DONE_AT) return "stored";
    if (currentTime >= SYNC_START_AT) return "pushing";
    if (currentTime >= SYNC_FAIL_AT) return "push-fail";
    return "idle";
  }, [currentTime]);

  const showPushArrow = phase === "pushing";
  const showPullArrow = phase === "pulling" || phase === "pull-done";
  const serverActive = phase !== "idle";
  const hasEvents = phase === "stored" || phase === "pulling" || phase === "pull-done";

  return (
    <div className="hidden w-36 flex-col items-center gap-2 self-center lg:flex">
      {/* Push arrow (desktop → server) */}
      <div className="flex h-5 items-center gap-1">
        <AnimatePresence>
          {showPushArrow && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-amber-400"
            >
              <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                <ArrowRight className="h-3.5 w-3.5" />
              </motion.div>
              <span className="text-[9px] font-medium tracking-wider uppercase">Push</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Server icon */}
      <motion.div
        className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-colors duration-500 ${
          phase === "push-fail"
            ? "border-red-500/50 bg-red-500/10"
            : serverActive
              ? "border-amber-500/50 bg-amber-500/10"
              : "border-zinc-700/50 bg-zinc-900/50"
        }`}
        animate={phase === "push-fail" ? { x: [-2, 2, -2, 2, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {phase === "push-fail" ? (
          <CloudOff className="h-6 w-6 text-red-400" />
        ) : (
          <Database
            className="h-6 w-6 text-zinc-400 transition-colors duration-500"
            style={{
              color: serverActive ? "hsl(32, 100%, 50%)" : undefined,
            }}
          />
        )}

        {/* Event count badge */}
        <AnimatePresence>
          {hasEvents && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-zinc-950"
            >
              3
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Server label */}
      <span
        className={`text-[9px] font-semibold tracking-wider uppercase transition-colors duration-500 ${
          phase === "push-fail" ? "text-red-400" : serverActive ? "text-zinc-400" : "text-zinc-600"
        }`}
      >
        {phase === "push-fail" ? "Offline" : "Server"}
      </span>

      {/* Pull arrow (server → phone) */}
      <div className="flex h-5 items-center gap-1">
        <AnimatePresence>
          {showPullArrow && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-amber-400"
            >
              <span className="text-[9px] font-medium tracking-wider uppercase">Pull</span>
              <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                <ArrowRight className="h-3.5 w-3.5" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Mobile Changelog Panel (static, always rendered) ────────────────

export function MobileSyncOverlay({ currentTime }: { currentTime: number }) {
  const pulling = currentTime >= PULL_TRIGGER_AT;
  const eventsVisible = currentTime >= PULL_EVENTS_AT;
  const pullDone = currentTime >= PULL_DONE_AT;

  return (
    <div className="mt-4 flex flex-col gap-1">
      {/* Header — always visible */}
      <div
        className={`flex items-center gap-1.5 text-[9px] font-semibold tracking-wider uppercase transition-colors duration-500 ${
          pullDone ? "text-emerald-400" : pulling ? "text-amber-400" : "text-zinc-600"
        }`}
      >
        <ScrollText className="h-2.5 w-2.5" />
        <span>Changelog</span>
        <AnimatePresence mode="wait">
          {pulling && !pullDone && (
            <motion.span
              key="bounce"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ArrowDown className="h-2.5 w-2.5 animate-bounce" />
            </motion.span>
          )}
          {pullDone && (
            <motion.span
              key="check"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* lastChangelogId badge — always visible */}
      <div
        className={`flex items-center gap-1.5 rounded border border-zinc-700/40 bg-zinc-900/70 px-2 py-1 text-[9px] backdrop-blur transition-opacity duration-500 ${
          pulling ? "opacity-100" : "opacity-40"
        }`}
      >
        <ArrowUp className="h-2.5 w-2.5 text-zinc-500" />
        <span className="font-mono text-zinc-500">lastChangelogId:</span>
        <span className="font-mono text-amber-400">42</span>
      </div>

      {/* Changelog events — slide in */}
      <AnimatePresence>
        {CHANGELOG_EVENTS.map(
          (event, i) =>
            eventsVisible && (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, height: 0, x: -16 }}
                animate={{ opacity: 1, height: "auto", x: 0 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: i * 0.1 }}
                className="overflow-hidden"
              >
                <EventCard
                  op={event.op}
                  model={event.model}
                  title={event.title}
                  icon={event.op === "CREATE" ? Plus : Pencil}
                  size="small"
                />
              </motion.div>
            )
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sync status badge ───────────────────────────────────────────────

function SyncStatusBadge({ phase }: { phase: "failing" | "syncing" | "done" }) {
  const configs = {
    failing: {
      icon: CloudOff,
      label: "Sync failed — offline",
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/20",
    },
    syncing: {
      icon: Cloud,
      label: "Pushing to server…",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    done: {
      icon: CheckCircle2,
      label: "Sync complete",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
  } as const;

  const cfg = configs[phase];
  const Icon = cfg.icon;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${cfg.bg}`}>
      <Icon
        className={`h-3.5 w-3.5 ${cfg.color} ${phase === "syncing" ? "animate-spin" : phase === "failing" ? "animate-pulse" : ""}`}
      />
      <span className={cfg.color}>{cfg.label}</span>
    </div>
  );
}
