/** Pinned "today" so the demo is stable. End of the fixture. */
export const APP_TODAY = "2026-11-20";
export const LOW_CONFIDENCE = 0.7;
export const STORE_KEY = "ripple-v1";
/** Persisted schema version. Bump when the saved shape changes: older saved state is cleared, not trusted. */
export const STORE_VERSION = 2;
export const PROJECTION_MONTHS = 24;
/** Model guesses about a merchant RIPPLE has never seen confirmed are capped below LOW_CONFIDENCE: the AI suggests, you confirm once, a rule remembers. */
export const LLM_UNCONFIRMED_CAP = 0.65;
/** Regret Engine: the ghost parks each saving at a plain savings-account rate. Our arithmetic, shown on screen. */
export const GHOST_ANNUAL_RATE = 0.06;
