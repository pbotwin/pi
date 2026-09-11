/** Tunables. Everything gameplay-feel lives here. */

export const BLOCK_HEIGHT = 0.55
export const BASE_SIZE = 3

/** Horizontal travel of the moving block, measured from centre. */
export const SWING = 3.6

export const START_SPEED = 2.6
export const SPEED_STEP = 0.08
export const MAX_SPEED = 7.5

/** Offset under which a drop counts as perfect. */
export const PERFECT_EPS = 0.12
/** Reward for a perfect drop: the slab grows back slightly. */
export const PERFECT_REGROW = 0.07

/** Vertical world units visible. Widened automatically on narrow screens. */
export const CAMERA_VIEW = 9
export const MIN_VIEW_WIDTH = 6.4

export const DEBRIS_LIFE = 2.4
export const DEBRIS_GRAVITY = 22

// --- feel -------------------------------------------------------------------
/** A perfect streak gives back more size than a lone perfect drop. */
export const PERFECT_REGROW_MAX = 0.24
export const COMBO_RAMP = 0.45

/** Expanding ring on a perfect drop. */
export const RING_LIFE = 0.5
export const RING_MAX_SCALE = 2.6

/** Dust kicked off the cut when a slab gets sheared. */
export const MOTE_COUNT = 12
export const MOTE_LIFE = 0.85
export const MOTE_GRAVITY = 9

/** Camera punch on impact. */
export const SHAKE_DECAY = 3.6
export const SHAKE_SLICE = 0.28
export const SHAKE_PERFECT = 0.16

/** Haptic pulse lengths in ms. */
export const BUZZ_PLACE = 12
export const BUZZ_PERFECT = 26
export const BUZZ_FAIL = 90
