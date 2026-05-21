import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema"

export class CheatEvent extends Schema {
  @type("string") playerId: string = ""
  @type("string") cheatType: string = ""
  @type("number") startTimestamp: number = 0
  @type("boolean") caught: boolean = false
}

export class ChessPiece extends Schema {
  @type("string") id: string = ""
  @type("string") pieceType: string = ""
  @type("string") ownerId: string = ""
  @type("number") row: number = 0
  @type("number") col: number = 0
  @type("boolean") isGhost: boolean = false
}

export class PlayerState extends Schema {
  @type("string") id: string = ""
  @type("string") name: string = ""
  @type("string") characterId: string = ""
  @type("number") score: number = 0
  @type("boolean") isConnected: boolean = true
  @type("boolean") isCheating: boolean = false
  @type("number") cheatStartTimestamp: number = 0
}

export class GameState extends Schema {
  @type("string") phase: string = "lobby"
  @type("number") currentRound: number = 0
  @type("string") currentMinigame: string = ""
  @type("string") wheelSpinnerId: string = ""
  @type("number") wheelVelocity: number = 0
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([CheatEvent]) cheatLog = new ArraySchema<CheatEvent>()
  @type({ map: ChessPiece }) chessPieces = new MapSchema<ChessPiece>()
  @type("string") chessTurnPlayerId: string = ""
  @type("number") chessTurnDeadline: number = 0
  @type(["string"]) chessPlayerOrder = new ArraySchema<string>()
  @type(["string"]) chessEliminatedIds = new ArraySchema<string>()
}
