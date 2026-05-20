export const MAX_ROUNDS = 10
export const CHEAT_WINDOW_MS = 1500
export const WHEEL_MIN_VELOCITY = 600
export const WHEEL_MAX_VELOCITY = 1200
export const WHEEL_ARROW_INFLUENCE = 0.05
export const WHEEL_BASE_DECEL = 200
export const CHESS_TURN_DURATION_MS = 30_000
export const SCORE_PLACEMENT = [3, 2, 1, 0] as const
export const SCORE_CHEAT_CAUGHT = -1
export const SCORE_CHEAT_SUCCESS = 1

export const MINIGAMES = ["chess"] as const
export type Minigame = (typeof MINIGAMES)[number]

export type GamePhase = "lobby" | "wheel" | "minigame" | "result" | "gameover"
