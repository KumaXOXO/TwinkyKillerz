import Phaser from "phaser"
import { joinGame, createRoom, joinByCode, sendPlayerReady, sendChat, sendGamemasterSettings, sendTransferGamemaster } from "../network/ColyseusClient"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"

const C = {
  panel: 0x16162a,
  border: 0x3a2a6e,
  text: "#e8d5ff",
  muted: "#7070a0",
  ready: "#44ff88",
  crown: "#ffcc44",
}

export class LobbyScene extends Phaser.Scene {
  private room: Room<GameState> | null = null
  private uiPhase: "lobby" = "lobby"
  private inputMode: "none" | "chat" = "none"
  private typedName = ""
  private characterId = "default"
  private joinMode: "create" | "join" | "joinOrCreate" | "existing" = "joinOrCreate"
  private roomCode = ""
  private createIsPrivate = false
  private preJoinedRoom: Room<GameState> | null = null
  private typedChat = ""
  private cursorVisible = true
  private cursorTimer = 0
  private roomCodeText!: Phaser.GameObjects.Text
  private chatLogText!: Phaser.GameObjects.Text
  private chatInputText!: Phaser.GameObjects.Text
  private actionText!: Phaser.GameObjects.Text
  private settingsText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private actionBtn!: Phaser.GameObjects.Rectangle
  private playerEntries: Phaser.GameObjects.Text[] = []
  private stateChangeCallback: ((state: GameState) => void) | null = null

  constructor() {
    super({ key: "LobbyScene" })
  }

  init(data?: {
    name?: string
    characterId?: string
    joinMode?: "create" | "join" | "existing" | "joinOrCreate"
    roomCode?: string
    room?: Room<GameState>
    isPrivate?: boolean
  }) {
    this.typedName = data?.name ?? ""
    this.characterId = data?.characterId ?? "default"
    this.joinMode = data?.joinMode ?? "joinOrCreate"
    this.roomCode = data?.roomCode ?? ""
    this.preJoinedRoom = data?.room ?? null
    this.createIsPrivate = data?.isPrivate ?? false
  }

  create() {
    this.doJoin(this.typedName)
    this.input.keyboard!.on("keydown", this.handleKeydown, this)
  }

  update(_time: number, delta: number) {
    this.cursorTimer += delta
    if (this.cursorTimer >= 500) {
      this.cursorTimer = 0
      this.cursorVisible = !this.cursorVisible
      this.refreshChatCursor()
    }
  }

  private async copyRoomCode(): Promise<void> {
    const code = this.room?.state.roomCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      return
    }
    sounds.menuConfirm()
    const original = this.roomCodeText.text
    this.roomCodeText.setText("COPIED!")
    this.time.delayedCall(900, () => {
      try {
        this.roomCodeText?.setText(original)
      } catch {
        // scene destroyed during delay, ignore
      }
    })
  }

  shutdown() {
    this.input.keyboard!.off("keydown", this.handleKeydown, this)
    if (this.stateChangeCallback && this.room) {
      this.room.onStateChange.remove(this.stateChangeCallback)
    }
  }

  private buildLobbyScreen() {
    const { width } = this.scale
    this.add.text(20, 16, "TWINKY GAMES", { fontSize: "20px", color: C.text, fontStyle: "bold" })
    this.roomCodeText = this.add
      .text(width - 20, 16, "", { fontSize: "20px", color: C.crown })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
    this.roomCodeText.on("pointerover", () => {
      this.tweens.add({
        targets: this.roomCodeText,
        scale: 1.15,
        duration: 120,
        ease: "Sine.easeOut",
      })
    })
    this.roomCodeText.on("pointerout", () => {
      this.tweens.add({
        targets: this.roomCodeText,
        scale: 1.0,
        duration: 120,
        ease: "Sine.easeOut",
      })
    })
    this.roomCodeText.on("pointerdown", () => this.copyRoomCode())
    this.add.rectangle(170, 290, 300, 430, C.panel).setStrokeStyle(1, C.border)
    this.add.text(170, 65, "PLAYERS", { fontSize: "12px", color: C.muted }).setOrigin(0.5)
    this.add.rectangle(570, 270, 340, 390, C.panel).setStrokeStyle(1, C.border)
    this.add.text(570, 65, "CHAT", { fontSize: "12px", color: C.muted }).setOrigin(0.5)
    this.chatLogText = this.add.text(405, 82, "", {
      fontSize: "12px",
      color: C.muted,
      wordWrap: { width: 320 },
      lineSpacing: 3,
    })
    this.add.rectangle(570, 472, 340, 34, 0x0a0a16).setStrokeStyle(1, C.border)
    this.chatInputText = this.add.text(410, 472, "", { fontSize: "13px", color: C.text }).setOrigin(0, 0.5)
    this.settingsText = this.add
      .text(width / 2, 520, "", { fontSize: "13px", color: C.muted, align: "center" })
      .setOrigin(0.5)
    this.actionBtn = this.add
      .rectangle(width / 2, 554, 240, 40, C.border)
      .setInteractive({ useHandCursor: true })
    this.actionBtn.on("pointerover", () => this.actionBtn.setFillStyle(0x2a1a4e))
    this.actionBtn.on("pointerout", () => this.actionBtn.setFillStyle(C.border))
    this.actionBtn.on("pointerdown", () => sendPlayerReady())
    this.actionText = this.add
      .text(width / 2, 554, "", { fontSize: "18px", color: "#aa77ff", fontStyle: "bold" })
      .setOrigin(0.5)
    this.hintText = this.add.text(width / 2, 584, "", { fontSize: "11px", color: C.muted }).setOrigin(0.5)
    this.refreshLobbyUI()
  }

  private refreshLobbyUI() {
    if (!this.room?.state?.players) return
    const state = this.room.state
    const me = state.players.get(this.room.sessionId)

    this.roomCodeText?.setText(`ROOM: ${state.roomCode}`)

    this.playerEntries.forEach(t => t.destroy())
    this.playerEntries = []
    let py = 82
    state.players.forEach((p, id) => {
      const ch = CHARACTERS.find(c => c.id === p.characterId)
      const symbol = ch?.symbol ?? "?"
      const prefix = p.isGamemaster ? "★ " : "  "
      const suffix = p.isReady ? " [READY]" : p.isConnected ? "" : " (offline)"
      const label = `${prefix}${symbol} ${p.name}${suffix}`
      const isMe = id === this.room?.sessionId
      const meIsGM = state.players.get(this.room?.sessionId ?? "")?.isGamemaster ?? false
      const canTransfer = meIsGM && !p.isGamemaster

      const t = this.add.text(30, py, label, {
        fontSize: "16px",
        color: isMe ? C.text : C.muted,
      })
      if (canTransfer) {
        t.setInteractive({ useHandCursor: true })
        t.on("pointerover", () => t.setColor(C.crown))
        t.on("pointerout", () => t.setColor(isMe ? C.text : C.muted))
        t.on("pointerdown", () => {
          sounds.menuConfirm()
          sendTransferGamemaster(id)
        })
      }
      this.playerEntries.push(t)
      py += 26
    })

    const chatLines = [...state.chatMessages]
      .slice(-14)
      .map((m) => `${state.players.get(m!.playerId)?.name ?? "?"}: ${m!.text}`)
    this.chatLogText?.setText(chatLines.join("\n"))

    const visibility = state.isPrivate ? "PRIVATE" : "PUBLIC"
    if (me?.isGamemaster) {
      this.settingsText?.setText(
        `[←/→] players: ${state.maxPlayers}   [M] mode: ${(state.gameMode ?? "olympiade").toUpperCase()}   ${visibility}`
      )
    } else {
      this.settingsText?.setText(
        `Mode: ${(state.gameMode ?? "olympiade").toUpperCase()}   Players: ${state.maxPlayers}   ${visibility}`
      )
    }

    const connected = [...state.players.values()].filter((p) => p.isConnected)
    const allReady = connected.length >= 2 && connected.every((p) => p.isReady)

    if (me?.isGamemaster && allReady) {
      this.actionText?.setText("SPACE — START GAME").setStyle({ color: C.ready })
    } else if (me?.isReady) {
      this.actionText?.setText("READY — WAITING FOR OTHERS").setStyle({ color: C.muted })
    } else {
      this.actionText?.setText("SPACE — READY").setStyle({ color: "#aa77ff" })
    }

    this.hintText?.setText(
      this.inputMode === "chat"
        ? "ESC cancel  |  ENTER send"
        : "C — chat   |   </> players (GM)   |   M mode (GM)",
    )
  }

  private refreshChatCursor() {
    if (this.uiPhase !== "lobby") return
    this.chatInputText?.setText(
      this.typedChat + (this.inputMode === "chat" ? (this.cursorVisible ? "|" : " ") : ""),
    )
  }

  private handleKeydown(event: KeyboardEvent) {
    this.handleLobbyKey(event)
  }

  private handleLobbyKey(event: KeyboardEvent) {
    if (!this.room) {
      if (event.key === "Enter") this.scene.start("CharacterSelectScene")
      return
    }
    if (this.inputMode === "chat") {
      this.handleChatKey(event)
      return
    }
    const me = this.room?.state.players.get(this.room.sessionId)
    if (event.key === " ") {
      sendPlayerReady()
    } else if (event.key === "c" || event.key === "C") {
      this.inputMode = "chat"
      this.typedChat = ""
      this.refreshChatCursor()
      this.refreshLobbyUI()
    } else if ((event.key === "m" || event.key === "M") && me?.isGamemaster) {
      sendGamemasterSettings(undefined, this.room!.state.gameMode === "olympiade" ? "single" : "olympiade")
    } else if (event.key === "ArrowLeft" && me?.isGamemaster && this.room!.state.maxPlayers > 2) {
      sendGamemasterSettings(this.room!.state.maxPlayers - 1)
    } else if (event.key === "ArrowRight" && me?.isGamemaster && this.room!.state.maxPlayers < 4) {
      sendGamemasterSettings(this.room!.state.maxPlayers + 1)
    }
  }

  private handleChatKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.inputMode = "none"
      this.typedChat = ""
      this.chatInputText?.setText("")
      this.refreshLobbyUI()
    } else if (event.key === "Enter") {
      const text = this.typedChat.trim()
      if (text) sendChat(text)
      this.inputMode = "none"
      this.typedChat = ""
      this.chatInputText?.setText("")
      this.refreshLobbyUI()
    } else if (event.key === "Backspace") {
      this.typedChat = this.typedChat.slice(0, -1)
      this.refreshChatCursor()
    } else if (event.key.length === 1 && this.typedChat.length < 100) {
      this.typedChat += event.key
      this.refreshChatCursor()
    }
  }

  private async doJoin(name: string) {
    try {
      if (this.preJoinedRoom) {
        this.room = this.preJoinedRoom
      } else if (this.joinMode === "create") {
        this.room = await createRoom(name, this.characterId, this.createIsPrivate)
      } else if (this.joinMode === "join") {
        this.room = await joinByCode(name, this.characterId, this.roomCode)
      } else {
        this.room = await joinGame(name, this.characterId)
      }
      this.children.removeAll(true)
      this.setupStateSync()
      this.buildLobbyScreen()
      this.time.delayedCall(150, () => this.refreshLobbyUI())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed"
      const cx = this.scale.width / 2
      const cy = this.scale.height / 2
      this.add.text(cx, cy, msg, { fontSize: "16px", color: "#ff5555" }).setOrigin(0.5)
      this.add.text(cx, cy + 36, "Press ENTER to go back", { fontSize: "13px", color: C.muted }).setOrigin(0.5)
    }
  }

  private setupStateSync() {
    if (!this.room) return
    this.stateChangeCallback = (state: GameState) => {
      if (state.phase === "game_select") {
        this.room!.onStateChange.remove(this.stateChangeCallback!)
        this.stateChangeCallback = null
        this.scene.start("GameSelectScene", { room: this.room })
        return
      }
      if (state.phase === "wheel") {
        this.room!.onStateChange.remove(this.stateChangeCallback!)
        this.stateChangeCallback = null
        this.scene.start("WheelScene", { room: this.room })
        return
      }
      this.refreshLobbyUI()
    }
    this.room.onStateChange(this.stateChangeCallback)
  }
}
