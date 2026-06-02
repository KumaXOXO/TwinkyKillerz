import { Client, Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export interface LobbyInfo {
  roomId: string
  roomCode: string
  playerCount: number
  maxPlayers: number
  isPrivate: boolean
}

const WS_URL = (import.meta.env as Record<string, string>)["VITE_SERVER_URL"] ?? "ws://localhost:2567"

let _client: Client | null = null
let _room: Room<GameState> | null = null

function getClient(): Client {
  if (!_client) _client = new Client(WS_URL)
  return _client
}

export async function joinGame(
  name: string,
  characterId: string
): Promise<Room<GameState>> {
  const rooms = await getClient().getAvailableRooms<{ isPrivate: boolean }>('game_room')
  const available = rooms.filter(r => !r.metadata?.isPrivate && r.clients < (r.maxClients ?? 4))
  if (available.length > 0) {
    const target = available.sort((a, b) => (b.clients ?? 0) - (a.clients ?? 0))[0]!
    _room = await getClient().joinById<GameState>(target.roomId, { name, characterId })
  } else {
    _room = await getClient().create<GameState>('game_room', { name, characterId })
  }
  return _room
}

export async function createRoom(
  name: string,
  characterId: string,
  isPrivate: boolean = false,
): Promise<Room<GameState>> {
  _room = await getClient().create<GameState>("game_room", { name, characterId, isPrivate })
  return _room
}

export async function joinByCode(
  name: string,
  characterId: string,
  roomCode: string,
): Promise<Room<GameState>> {
  const code = roomCode.toUpperCase().trim()
  const rooms = await getClient().getAvailableRooms<{ roomCode: string }>('game_room')
  const target = rooms.find(r => r.metadata?.roomCode === code)
  if (!target) throw new Error("Room not found")
  try {
    _room = await getClient().joinById<GameState>(target.roomId, { name, characterId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Join failed"
    if (msg.toLowerCase().includes("full")) throw new Error("Room is full")
    throw new Error(msg)
  }
  return _room
}

export function getRoom(): Room<GameState> | null {
  return _room
}

export function sendCheatAttempt(cheatType: string): void {
  _room?.send("cheat_attempt", { cheatType })
}

export function sendCatchCheat(targetId: string): void {
  _room?.send("catch_cheat", { targetId })
}

export function sendPlayerReady(): void {
  _room?.send("player_ready", {})
}

export function sendWheelDone(): void {
  _room?.send("wheel_done", {})
}

export function sendChessMove(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
  _room?.send("chess_move", { fromRow, fromCol, toRow, toCol })
}

export function sendChat(text: string): void {
  _room?.send("chat", { text })
}

export function sendGamemasterSettings(maxPlayers?: number, gameMode?: string, isPrivate?: boolean): void {
  _room?.send("gamemaster_settings", { maxPlayers, gameMode, isPrivate })
}

export function sendKickPlayer(targetId: string): void {
  _room?.send("kick_player", { targetId })
}

export function sendTransferGamemaster(targetId: string): void {
  _room?.send("transfer_gamemaster", { targetId })
}

export function sendPlaceChip(fieldIndex: number): void {
  _room?.send("place_chip", { fieldIndex })
}

export function sendConnect4Drop(col: number): void {
  _room?.send("connect4_drop", { col })
}

export function sendSelectGame(game: string): void {
  _room?.send("select_game", { game })
}

export async function getPublicLobbies(): Promise<LobbyInfo[]> {
  const rooms = await getClient().getAvailableRooms<{
    roomCode: string
    playerCount: number
    maxPlayers: number
    isPrivate: boolean
  }>("game_room")
  return rooms
    .filter(r => r.metadata && !r.metadata.isPrivate)
    .map(r => ({
      roomId: r.roomId,
      roomCode: r.metadata!.roomCode,
      playerCount: r.metadata!.playerCount,
      maxPlayers: r.metadata!.maxPlayers,
      isPrivate: r.metadata!.isPrivate,
    }))
}

export async function joinLobbyById(
  name: string,
  characterId: string,
  roomId: string,
): Promise<Room<GameState>> {
  _room = await getClient().joinById<GameState>(roomId, { name, characterId })
  return _room
}
