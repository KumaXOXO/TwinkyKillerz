import Phaser from "phaser"
import { joinGame, sendPlayerReady, sendChat, sendGamemasterSettings } from "../network/ColyseusClient"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

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
  private uiPhase: "nameInput" | "lobby" = "nameInput"
  private inputMode: "none" | "chat" = "none"
  private typedName = ""
  private typedChat = ""
  private cursorVisible = true
  private cursorTimer = 0
  private nameDisplayText!: Phaser.GameObjects.Text
  private nameHintText!: Phaser.GameObjects.Text
  private roomCodeText!: Phaser.GameObjects.Text
  private playerListText!: Phaser.GameObjects.Text
  private chatLogText!: Phaser.GameObjects.Text
  private chatInputText!: Phaser.GameObjects.Text
  private actionText!: Phaser.GameObjects.Text
  private settingsText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private stateChangeCallback: ((state: GameState) => void) | null = null

  constructor() {
    super({ key: "LobbyScene" })
  }

  create() {
    this.buildNameInputScreen()
    this.input.keyboard!.on("keydown", this.handleKeydown, this)
  }

  update(_time: number, delta: number) {
    this.cursorTimer += delta
    if (this.cursorTimer >= 500) {
      this.cursorTimer = 0
      this.cursorVisible = !this.cursorVisible
      if (this.uiPhase === "nameInput") this.refreshNameCursor()
      else this.refreshChatCursor()
    }
  }

  shutdown() {
    this.input.keyboard!.off("keydown", this.handleKeydown, this)
    if (this.stateChangeCallback && this.room) {
      this.room.onStateChange.remove(this.stateChangeCallback)
    }
  }

  private buildNameInputScreen() {
    const { width, height } = this.scale
    this.add
      .text(width / 2, height / 2 - 120, "TWINKY KILLERZ", { fontSize: "40px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)
    this.add
      .text(width / 2, height / 2 - 40, "Enter your name:", { fontSize: "18px", color: C.muted })
      .setOrigin(0.5)
    this.add.rectangle(width / 2, height / 2 + 10, 320, 44, C.panel).setStrokeStyle(2, C.border)
    this.nameDisplayText = this.add
      .text(width / 2, height / 2 + 10, "", { fontSize: "22px", color: C.text })
      .setOrigin(0.5)
    this.nameHintText = this.add
      .text(width / 2, height / 2 + 60, "Press ENTER to join", { fontSize: "14px", color: C.muted })
      .setOrigin(0.5)
    this.refreshNameCursor()
  }

  private refreshNameCursor() {
    if (this.uiPhase !== "nameInput") return
    this.nameDisplayText?.setText(this.typedName + (this.cursorVisible ? "|" : " "))
  }

  private buildLobbyScreen() {
    const { width } = this.scale
    this.add.text(20, 16, "TWINKY KILLERZ", { fontSize: "20px", color: C.text, fontStyle: "bold" })
    this.roomCodeText = this.add.text(width - 20, 16, "", { fontSize: "20px", color: C.crown }).setOrigin(1, 0)
    this.add.rectangle(170, 290, 300, 430, C.panel).setStrokeStyle(1, C.border)
    this.add.text(170, 65, "PLAYERS", { fontSize: "12px", color: C.muted }).setOrigin(0.5)
    this.playerListText = this.add.text(30, 82, "", { fontSize: "16px", color: C.text, lineSpacing: 10 })
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
    this.actionText = this.add
      .text(width / 2, 554, "", { fontSize: "18px", color: "#aa77ff", fontStyle: "bold" })
      .setOrigin(0.5)
    this.hintText = this.add.text(width / 2, 584, "", { fontSize: "11px", color: C.muted }).setOrigin(0.5)
    this.refreshLobbyUI()
  }

  private refreshLobbyUI() {
    if (!this.room) return
    const state = this.room.state
    const me = state.players.get(this.room.sessionId)

    this.roomCodeText?.setText(`ROOM: ${state.roomCode}`)

    const playerLines: string[] = []
    state.players.forEach((p) => {
      playerLines.push(
        `${p.isGamemaster ? "* " : "  "}${p.name}${p.isReady ? " [READY]" : ""}${p.isConnected ? "" : " (offline)"}`,
      )
    })
    this.playerListText?.setText(playerLines.join("\n"))

    const chatLines = [...state.chatMessages]
      .slice(-14)
      .map((m) => `${state.players.get(m!.playerId)?.name ?? "?"}: ${m!.text}`)
    this.chatLogText?.setText(chatLines.join("\n"))

    if (me?.isGamemaster) {
      this.settingsText?.setText(`[</> players: ${state.maxPlayers}   [M] mode: ${state.gameMode.toUpperCase()}`)
    } else {
      this.settingsText?.setText(`Mode: ${state.gameMode.toUpperCase()}   Players: ${state.maxPlayers}`)
    }

    const connected = [...state.players.values()].filter((p) => p.isConnected)
    const allReady = connected.length >= 2 && connected.every((p) => p.isReady)

    if (me?.isGamemaster && allReady) {
      this.actionText?.setText("SPACE — START GAME").setStyle({ color: C.ready })
    } else if (me?.isReady) {
      this.actionText?.setText("SPACE — NOT READY").setStyle({ color: C.muted })
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
    if (this.uiPhase === "nameInput") this.handleNameKey(event)
    else this.handleLobbyKey(event)
  }

  private handleNameKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      const name = this.typedName.trim()
      if (name) this.doJoin(name)
    } else if (event.key === "Backspace") {
      this.typedName = this.typedName.slice(0, -1)
      this.refreshNameCursor()
    } else if (event.key.length === 1 && this.typedName.length < 20) {
      this.typedName += event.key
      this.refreshNameCursor()
    }
  }

  private handleLobbyKey(event: KeyboardEvent) {
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
    this.nameHintText?.setText("Connecting...")
    try {
      this.room = await joinGame(name, "default")
      this.uiPhase = "lobby"
      this.children.removeAll(true)
      this.buildLobbyScreen()
      this.setupStateSync()
    } catch {
      this.nameHintText?.setText("Connection failed — is the server running?")
    }
  }

  private setupStateSync() {
    if (!this.room) return
    this.stateChangeCallback = (state: GameState) => {
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
