import { CONNECT4_COLS, CONNECT4_ROWS } from "./constants"

export type Board = string[][] // [row][col], "" = empty, playerId otherwise

export function buildBoard(): Board {
  return Array.from({ length: CONNECT4_ROWS }, () => Array(CONNECT4_COLS).fill(""))
}

export function dropPiece(
  board: Board,
  col: number,
  playerId: string
): { row: number; col: number } | null {
  for (let r = CONNECT4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === "") {
      board[r][col] = playerId
      return { row: r, col }
    }
  }
  return null
}

export function checkWin(board: Board, row: number, col: number, playerId: string): boolean {
  const dirs: Array<[number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (const [dr, dc] of dirs) {
    let count = 1
    for (const sign of [1, -1] as const) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < CONNECT4_ROWS && c >= 0 && c < CONNECT4_COLS && board[r][c] === playerId) {
        count++
        r += dr * sign
        c += dc * sign
      }
    }
    if (count >= 4) return true
  }
  return false
}

export function isColumnFull(board: Board, col: number): boolean {
  return board[0][col] !== ""
}

export function isBoardFull(board: Board): boolean {
  return board[0].every(cell => cell !== "")
}

export function flattenBoard(board: Board): string[] {
  return board.flat()
}
