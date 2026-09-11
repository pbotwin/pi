/** Tunables. Everything gameplay-feel lives here. */

// --- world ------------------------------------------------------------------
export const GRAVITY = -22
export const GROUND_Y = 0
/** Half-extent of the platform the structure stands on. */
export const PLATFORM_R = 4.2
export const PLATFORM_H = 0.5

// --- structure --------------------------------------------------------------
export const PILLAR_W = 0.46
export const PILLAR_H = 1.35
export const BEAM_H = 0.34
export const BAY = 1.5
export const CORE_SIZE = 0.62

export const FLOORS_BASE = 3
export const FLOORS_MAX = 7
export const CORES_BASE = 1
export const CORES_MAX = 6

// --- shooting ---------------------------------------------------------------
export const SHOTS_BASE = 4
export const ORB_R = 0.32
export const ORB_MASS = 9
export const POWER_MIN = 14
export const POWER_MAX = 34
/** Where shots originate, relative to the platform centre. */
export const MUZZLE = { x: 0, y: 2.2, z: 11.0 }

export const YAW_RANGE = 0.5
export const PITCH_MIN = -0.06
export const PITCH_MAX = 0.42

// --- destruction ------------------------------------------------------------
/** Impact energy above which a block shatters into fragments. */
export const FRACTURE_IMPULSE = 11
export const FRAGMENTS = 5
/** Impact energy that shatters a core. Lower than a block: cores are brittle. */
export const CORE_IMPULSE = 7
/** Hard cap so a chain reaction cannot melt a phone. */
export const MAX_BODIES = 190
/** Anything below this is gone for good. */
export const KILL_Y = -14

// --- camera -----------------------------------------------------------------
export const CAM_POS = { x: 0, y: 4.3, z: 13.6 }
export const CAM_LOOK = { x: 0, y: 2.3, z: 0 }
export const CAM_FOV = 42

// --- input ------------------------------------------------------------------
export const DRAG_FULL_PX = 240
export const SETTLE_TIME = 1.6
