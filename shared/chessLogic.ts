import { CHESS_CORNERS, CHESS_STARTING_POSITIONS } from "./constants"

export interface ChessPieceData {
  id: string
  pieceType: string
  ownerId: string
  row: number
  col: number
  isGhost: boolean
}

export function buildInitialBoard(playerIds: string[]): ChessPieceData[] {
  const pieces: ChessPieceData[] = []
  playerIds.forEach((playerId, playerIdx) => {
    const corner = CHESS_CORNERS[playerIdx % 4]
    CHESS_STARTING_POSITIONS[corner].forEach(([row, col, pieceType], pieceIdx) => {
      pieces.push({ id: `${playerId}-${pieceIdx}`, pieceType, ownerId: playerId, row, col, isGhost: false })
    })
  })
  return pieces
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

function pieceAt(pieces: ChessPieceData[], row: number, col: number): ChessPieceData | undefined {
  return pieces.find(p => p.row === row && p.col === col)
}

function slidingMoves(
  piece: ChessPieceData,
  pieces: ChessPieceData[],
  dirs: Array<[number, number]>
): Array<[number, number]> {
  const moves: Array<[number, number]> = []
  for (const [dr, dc] of dirs) {
    let r = piece.row + dr
    let c = piece.col + dc
    while (inBounds(r, c)) {
      const blocker = pieceAt(pieces, r, c)
      if (blocker) {
        if (!blocker.isGhost) {
          if (blocker.ownerId !== piece.ownerId) moves.push([r, c])
          break
        }
        // ghost: pass through — can move to this square but not capture
        moves.push([r, c])
      } else {
        moves.push([r, c])
      }
      r += dr
      c += dc
    }
  }
  return moves
}

export function getValidMoves(
  pieceId: string,
  pieces: ChessPieceData[],
  pawnDirs: Record<string, number>
): Array<[number, number]> {
  const piece = pieces.find(p => p.id === pieceId)
  if (!piece || piece.isGhost) return []

  const { pieceType, row, col, ownerId } = piece

  if (pieceType === "rook") {
    return slidingMoves(piece, pieces, [[0,1],[0,-1],[1,0],[-1,0]])
  }

  if (pieceType === "knight") {
    const candidates: Array<[number, number]> = [
      [row-2,col+1],[row-2,col-1],[row+2,col+1],[row+2,col-1],
      [row-1,col+2],[row-1,col-2],[row+1,col+2],[row+1,col-2],
    ]
    return candidates.filter(([r,c]) => {
      if (!inBounds(r, c)) return false
      const blocker = pieceAt(pieces, r, c)
      return !blocker || blocker.isGhost || blocker.ownerId !== ownerId
    })
  }

  if (pieceType === "king") {
    const candidates: Array<[number, number]> = [
      [row-1,col-1],[row-1,col],[row-1,col+1],
      [row,col-1],              [row,col+1],
      [row+1,col-1],[row+1,col],[row+1,col+1],
    ]
    return candidates.filter(([r,c]) => {
      if (!inBounds(r, c)) return false
      const blocker = pieceAt(pieces, r, c)
      return !blocker || blocker.isGhost || blocker.ownerId !== ownerId
    })
  }

  if (pieceType === "pawn") {
    const dir = pawnDirs[ownerId] ?? -1
    const moves: Array<[number, number]> = []
    const fwd = row + dir
    if (inBounds(fwd, col) && !pieceAt(pieces, fwd, col)) {
      moves.push([fwd, col])
    }
    for (const dc of [-1, 1]) {
      const tc = col + dc
      if (!inBounds(fwd, tc)) continue
      const target = pieceAt(pieces, fwd, tc)
      if (target && target.ownerId !== ownerId && !target.isGhost) {
        moves.push([fwd, tc])
      }
    }
    return moves
  }

  return []
}

export function applyMove(
  pieces: ChessPieceData[],
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): { pieces: ChessPieceData[]; captured: ChessPieceData | null } {
  const mover = pieces.find(p => p.row === fromRow && p.col === fromCol)
  const target = pieces.find(p => p.row === toRow && p.col === toCol && !p.isGhost)
  const captured = (target && mover && target.ownerId !== mover.ownerId) ? target : null

  const updated = pieces
    .filter(p => !(p.row === toRow && p.col === toCol && !p.isGhost && mover && p.ownerId !== mover.ownerId))
    .map(p => {
      if (p.row === fromRow && p.col === fromCol) {
        return { ...p, row: toRow, col: toCol }
      }
      return p
    })

  return { pieces: updated, captured }
}

export function isPlayerEliminated(pieces: ChessPieceData[], playerId: string): boolean {
  return !pieces.some(p => p.ownerId === playerId && p.pieceType === "king" && !p.isGhost)
}
