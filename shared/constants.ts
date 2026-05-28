export const MAX_ROUNDS = 10
export const CHEAT_WINDOW_MS = 1500
export const WHEEL_PLACEMENT_MS = 12_000
export const CHIPS_LAST_PLACE = 2
export const CHIPS_SECOND_LAST = 1
export const WHEEL_MIN_VELOCITY = 600
export const WHEEL_MAX_VELOCITY = 1200
export const WHEEL_ARROW_INFLUENCE = 0.05
export const WHEEL_BASE_DECEL = 200
export const CHESS_TURN_DURATION_MS = 30_000
export const SCORE_PLACEMENT = [3, 2, 1, 0] as const
export const SCORE_CHEAT_CAUGHT = -1
export const SCORE_CHEAT_SUCCESS = 1

export const MINIGAMES = ["chess", "connect4"] as const
export type Minigame = (typeof MINIGAMES)[number]

export const CONNECT4_COLS = 7
export const CONNECT4_ROWS = 6
export const CONNECT4_TURN_MS = 20_000

export type GamePhase = "lobby" | "wheel" | "minigame" | "result" | "gameover"

export const CHESS_CORNERS = ["bottom-left", "bottom-right", "top-right", "top-left"] as const
export type ChessCorner = (typeof CHESS_CORNERS)[number]

// 3-4 player chess: 8 pieces per corner — kings at the outer corners
export const CHESS_STARTING_POSITIONS: Record<ChessCorner, Array<[number, number, string]>> = {
  "bottom-left": [
    [7,0,"king"],[7,1,"knight"],[7,2,"bishop"],[7,3,"rook"],
    [6,0,"pawn"],[6,1,"pawn"],[6,2,"pawn"],[6,3,"pawn"],
  ],
  "bottom-right": [
    [7,7,"king"],[7,6,"knight"],[7,5,"bishop"],[7,4,"rook"],
    [6,7,"pawn"],[6,6,"pawn"],[6,5,"pawn"],[6,4,"pawn"],
  ],
  "top-right": [
    [0,7,"king"],[0,6,"knight"],[0,5,"bishop"],[0,4,"rook"],
    [1,7,"pawn"],[1,6,"pawn"],[1,5,"pawn"],[1,4,"pawn"],
  ],
  "top-left": [
    [0,0,"king"],[0,1,"knight"],[0,2,"bishop"],[0,3,"rook"],
    [1,0,"pawn"],[1,1,"pawn"],[1,2,"pawn"],[1,3,"pawn"],
  ],
}

// Standard 2-player chess: full 16 pieces per side
export const CHESS_2P_STARTING_POSITIONS: Record<"white" | "black", Array<[number, number, string]>> = {
  white: [
    [7,0,"rook"],[7,1,"knight"],[7,2,"bishop"],[7,3,"queen"],
    [7,4,"king"],[7,5,"bishop"],[7,6,"knight"],[7,7,"rook"],
    [6,0,"pawn"],[6,1,"pawn"],[6,2,"pawn"],[6,3,"pawn"],
    [6,4,"pawn"],[6,5,"pawn"],[6,6,"pawn"],[6,7,"pawn"],
  ],
  black: [
    [0,0,"rook"],[0,1,"knight"],[0,2,"bishop"],[0,3,"queen"],
    [0,4,"king"],[0,5,"bishop"],[0,6,"knight"],[0,7,"rook"],
    [1,0,"pawn"],[1,1,"pawn"],[1,2,"pawn"],[1,3,"pawn"],
    [1,4,"pawn"],[1,5,"pawn"],[1,6,"pawn"],[1,7,"pawn"],
  ],
}

// pawn advances toward center: bottom players go up (-1), top players go down (+1)
export const CHESS_PAWN_DIRS: Record<ChessCorner, number> = {
  "bottom-left": -1, "bottom-right": -1, "top-right": 1, "top-left": 1,
}

export const CHESS_PLAYER_COLORS = ["#aa77ff", "#44ddff", "#ffaa44", "#44ff88"] as const

export const CHESS_PIECE_SYMBOLS: Record<string, string> = {
  king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙",
}

export const CHESS_TURN_MS = 30_000

export const CHARACTERS = [
  { id: "knight", name: "Knight", color: "#aa77ff", symbol: "♘" },
  { id: "rook",   name: "Rook",   color: "#44ddff", symbol: "♖" },
  { id: "bishop", name: "Bishop", color: "#ffaa44", symbol: "♗" },
  { id: "queen",  name: "Queen",  color: "#44ff88", symbol: "♕" },
  { id: "pawn",   name: "Pawn",   color: "#ff6688", symbol: "♙" },
  { id: "king",   name: "King",   color: "#ffcc44", symbol: "♔" },
] as const
export type CharacterId = (typeof CHARACTERS)[number]["id"]
