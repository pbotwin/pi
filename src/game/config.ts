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
