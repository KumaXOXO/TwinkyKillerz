import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema"

export class CheatEvent extends Schema {
  @type("string") playerId: string = ""
  @type("string") cheatType: string = ""
  @type("number") startTimestamp: number = 0
  @type("boolean") caught: boolean = false
}

export class ChatMessage extends Schema {
  @type("string") playerId: string = ""
  @type("string") text: string = ""
  @type("number") timestamp: number = 0
}

export class ChessPiece extends Schema {
  @type("string") id: string = ""
  @type("string") pieceType: string = ""
  @type("string") ownerId: string = ""
  @type("number") row: number = 0
  @type("number") col: number = 0
  @type("boolean") isGhost: boolean = false
}

export class ChessState extends Schema {
  @type({ map: ChessPiece }) pieces = new MapSchema<ChessPiece>()
  @type("string") turnPlayerId: string = ""
  @type("number") turnDeadline: number = 0
  @type(["string"]) playerOrder = new ArraySchema<string>()
  @type(["string"]) eliminatedIds = new ArraySchema<string>()
}

export class WheelField extends Schema {
  @type("string") minigame: string = ""
  @type("number") fixedChips: number = 0
}

export class WheelState extends Schema {
  @type("string") spinnerId: string = ""
  @type("number") velocity: number = 0
  @type({ map: WheelField }) fields = new MapSchema<WheelField>()
  @type("boolean") placementPhase: boolean = false
  @type("number") placementDeadline: number = 0
}

export class OlympiadeState extends Schema {
  @type("number") currentRound: number = 0
  @type("string") currentMinigame: string = ""
  @type(WheelState) wheel = new WheelState()
}

export class PlayerState extends Schema {
  @type("string") id: string = ""
  @type("string") name: string = ""
  @type("string") characterId: string = ""
  @type("number") score: number = 0
  @type("number") chips: number = 0
  @type("boolean") isConnected: boolean = true
  @type("boolean") isReady: boolean = false
  @type("boolean") isGamemaster: boolean = false
  @type("boolean") isCheating: boolean = false
  @type("number") cheatStartTimestamp: number = 0
}

export class GameState extends Schema {
  @type("string") phase: string = "lobby"
  @type("string") roomCode: string = ""
  @type("number") maxPlayers: number = 4
  @type("string") gameMode: string = "olympiade"
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([CheatEvent]) cheatLog = new ArraySchema<CheatEvent>()
  @type([ChatMessage]) chatMessages = new ArraySchema<ChatMessage>()
  @type(OlympiadeState) olympiade = new OlympiadeState()
  @type(ChessState) chess = new ChessState()
}
