// ─── Shared demo-video timeline constants ────────────────────────────
// Single source of truth consumed by sync-flow-overlay.tsx & demo-player.tsx

export const SYNC_FAIL_AT = 7;
export const SYNC_START_AT = 9.5;
export const SYNC_DONE_AT = 10;

// Mobile video starts at MOBILE_DELAY (12.5s desktop time)
export const MOBILE_DELAY = 12.5;
export const PULL_TRIGGER_AT = MOBILE_DELAY + 3.5;
export const PULL_EVENTS_AT = MOBILE_DELAY + 3.75;
export const PULL_DONE_AT = MOBILE_DELAY + 4;
