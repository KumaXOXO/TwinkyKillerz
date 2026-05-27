import { describe, it, expect } from "vitest"
import { GameState, PlayerState } from "../../shared/schema"
import { CHEAT_WINDOW_MS, MAX_ROUNDS } from "../../shared/constants"

describe("GameState", () => {
  it("initialises with lobby phase", () => {
    const state = new GameState()
    expect(state.phase).toBe("lobby")
    expect(state.olympiade.currentRound).toBe(0)
  })

  it("initialises with empty player map", () => {
    const state = new GameState()
    expect(state.players.size).toBe(0)
  })
})

describe("PlayerState", () => {
  it("initialises with zero score and not cheating", () => {
    const player = new PlayerState()
    expect(player.score).toBe(0)
    expect(player.isCheating).toBe(false)
    expect(player.cheatStartTimestamp).toBe(0)
  })
})

describe("constants", () => {
  it("cheat window is 1500ms", () => {
    expect(CHEAT_WINDOW_MS).toBe(1500)
  })

  it("max rounds is 10", () => {
    expect(MAX_ROUNDS).toBe(10)
  })
})
