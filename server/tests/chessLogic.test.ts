import { describe, it, expect } from "vitest"
import {
  buildInitialBoard,
  applyMove,
  getValidMoves,
  getLegalMoves,
  isInCheck,
  hasLegalMoves,
  ChessPieceData,
} from "../../shared/chessLogic"

function makeBoard(pieces: Partial<ChessPieceData>[]): ChessPieceData[] {
  return pieces.map((p, i) => ({
    id: p.id ?? `piece-${i}`,
    pieceType: p.pieceType ?? "pawn",
    ownerId: p.ownerId ?? "p1",
    row: p.row ?? 0,
    col: p.col ?? 0,
    isGhost: p.isGhost ?? false,
  }))
}

describe("isInCheck", () => {
  it("returns false when king is not threatened", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 0, col: 0 },
    ])
    expect(isInCheck(pieces, "p1", {})).toBe(false)
  })

  it("detects rook check on same row", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 4, col: 0 },
    ])
    expect(isInCheck(pieces, "p1", {})).toBe(true)
  })

  it("rook check blocked by own piece returns false", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "b1", pieceType: "pawn", ownerId: "p1", row: 4, col: 2 },
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 4, col: 0 },
    ])
    expect(isInCheck(pieces, "p1", {})).toBe(false)
  })

  it("queen checks diagonally", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "q2", pieceType: "queen", ownerId: "p2", row: 1, col: 1 },
    ])
    expect(isInCheck(pieces, "p1", {})).toBe(true)
  })

  it("returns false when player has no king", () => {
    const pieces = makeBoard([
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 4, col: 0 },
    ])
    expect(isInCheck(pieces, "p1", {})).toBe(false)
  })
})

describe("getLegalMoves", () => {
  it("filters out moves that leave king in check", () => {
    // p1 rook at (4,2) is pinned: moving off row 4 exposes king at (4,4) to p2 rook at (4,0)
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "pr", pieceType: "rook", ownerId: "p1", row: 4, col: 2 },
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 4, col: 0 },
    ])
    const legalMoves = getLegalMoves("pr", pieces, {})
    const offRowMoves = legalMoves.filter(([r]) => r !== 4)
    expect(offRowMoves).toHaveLength(0)
  })

  it("king cannot move into check", () => {
    // p2 rook at (0,5) controls col 5 — king cannot step to col 5
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 0, col: 5 },
    ])
    const legalMoves = getLegalMoves("k1", pieces, {})
    const col5Moves = legalMoves.filter(([, c]) => c === 5)
    expect(col5Moves).toHaveLength(0)
  })

  it("returns all 8 king moves when no threats", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
    ])
    expect(getLegalMoves("k1", pieces, {})).toHaveLength(8)
  })
})

describe("hasLegalMoves", () => {
  it("returns true for a player with moves", () => {
    const pieces = makeBoard([
      { id: "k1", pieceType: "king", ownerId: "p1", row: 4, col: 4 },
    ])
    expect(hasLegalMoves(pieces, "p1", {})).toBe(true)
  })

  it("returns false when player has no pieces", () => {
    const pieces = makeBoard([
      { id: "r2", pieceType: "rook", ownerId: "p2", row: 0, col: 0 },
    ])
    expect(hasLegalMoves(pieces, "p1", {})).toBe(false)
  })
})

describe("applyMove pawn promotion", () => {
  it("promotes pawn to queen when bottom player reaches row 0", () => {
    const pieces = makeBoard([
      { id: "p1", pieceType: "pawn", ownerId: "alice", row: 1, col: 3 },
    ])
    const { pieces: after } = applyMove(pieces, 1, 3, 0, 3, { alice: -1 })
    expect(after.find(p => p.id === "p1")?.pieceType).toBe("queen")
  })

  it("promotes pawn to queen when top player reaches row 7", () => {
    const pieces = makeBoard([
      { id: "p1", pieceType: "pawn", ownerId: "bob", row: 6, col: 3 },
    ])
    const { pieces: after } = applyMove(pieces, 6, 3, 7, 3, { bob: 1 })
    expect(after.find(p => p.id === "p1")?.pieceType).toBe("queen")
  })

  it("does not promote pawn mid-board", () => {
    const pieces = makeBoard([
      { id: "p1", pieceType: "pawn", ownerId: "alice", row: 3, col: 3 },
    ])
    const { pieces: after } = applyMove(pieces, 3, 3, 2, 3, { alice: -1 })
    expect(after.find(p => p.id === "p1")?.pieceType).toBe("pawn")
  })

  it("does not promote when pawnDirs not provided", () => {
    const pieces = makeBoard([
      { id: "p1", pieceType: "pawn", ownerId: "alice", row: 1, col: 3 },
    ])
    const { pieces: after } = applyMove(pieces, 1, 3, 0, 3)
    expect(after.find(p => p.id === "p1")?.pieceType).toBe("pawn")
  })
})

describe("queen moves", () => {
  it("queen moves in all 8 directions from center", () => {
    const pieces = makeBoard([
      { id: "q1", pieceType: "queen", ownerId: "p1", row: 4, col: 4 },
    ])
    const moves = getValidMoves("q1", pieces, {})
    expect(moves.length).toBeGreaterThan(15)
    expect(moves.some(([r, c]) => r === 1 && c === 1)).toBe(true)
    expect(moves.some(([r, c]) => r === 4 && c === 0)).toBe(true)
  })
})

describe("buildInitialBoard", () => {
  it("creates 16 pieces per player in 2P mode", () => {
    const { pieces } = buildInitialBoard(["alice", "bob"])
    expect(pieces.filter(p => p.ownerId === "alice")).toHaveLength(16)
    expect(pieces.filter(p => p.ownerId === "bob")).toHaveLength(16)
  })

  it("each player has exactly one king", () => {
    const { pieces } = buildInitialBoard(["alice", "bob"])
    expect(pieces.filter(p => p.ownerId === "alice" && p.pieceType === "king")).toHaveLength(1)
  })

  it("returns correct pawnDirs for 2P: white goes up (-1), black goes down (+1)", () => {
    const { pawnDirs } = buildInitialBoard(["alice", "bob"])
    expect(pawnDirs["alice"]).toBe(-1)
    expect(pawnDirs["bob"]).toBe(1)
  })

  it("creates 8 pieces per player in 3P mode", () => {
    const { pieces } = buildInitialBoard(["p1", "p2", "p3"])
    expect(pieces.filter(p => p.ownerId === "p1")).toHaveLength(8)
    expect(pieces.filter(p => p.ownerId === "p2")).toHaveLength(8)
    expect(pieces.filter(p => p.ownerId === "p3")).toHaveLength(8)
  })

  it("creates 8 pieces per player in 4P mode", () => {
    const { pieces } = buildInitialBoard(["p1", "p2", "p3", "p4"])
    expect(pieces.filter(p => p.ownerId === "p1")).toHaveLength(8)
    expect(pieces.filter(p => p.ownerId === "p4")).toHaveLength(8)
  })
})
