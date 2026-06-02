import Phaser from "phaser"
import { joinGame, createRoom, joinByCode, sendPlayerReady, sendChat, sendGamemasterSettings, sendTransferGamemaster } from "../network/ColyseusClient"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"
import { THEME, toHex } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

export class LobbyScene extends Phaser.Scene {
  private room: Room<GameState> | null = null
  private uiPhase: "lobby" = "lobby"
  private inputMode: "none" | "chat" = "none"
  private typedName = ""
  private characterId = "default"
  private joinMode: "create" | "join" | "joinOrCreate" | "existing" = "joinOrCreate"
  private roomCode = ""
  private createIsPrivate = false
  private createMaxPlayers = 2
  private createGameMode = "olympiade"
  private preJoinedRoom: Room<GameState> | null = null
  private typedChat = ""
  private cursorVisible = true
  private cursorTimer = 0
  private roomCodeText!: Phaser.GameObjects.Text
  private chatLogText!: Phaser.GameObjects.Text
  private chatInputText!: Phaser.GameObjects.Text
  private chatInputRect!: Phaser.GameObjects.Rectangle
  private actionText!: Phaser.GameObjects.Text
  private settingsText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private actionBtn!: Phaser.GameObjects.Container
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
    maxPlayers?: number
    gameMode?: string
  }) {
    this.typedName = data?.name ?? ""
    this.characterId = data?.characterId ?? "default"
    this.joinMode = data?.joinMode ?? "joinOrCreate"
    this.roomCode = data?.roomCode ?? ""
    this.preJoinedRoom = data?.room ?? null
    this.createIsPrivate = data?.isPrivate ?? false
    this.createMaxPlayers = data?.maxPlayers ?? 2
    this.createGameMode = data?.gameMode ?? "olympiade"
  }

  create() {
    this.doJoin(this.typedName)
    this.input.keyboard!.on("keydown", this.handleKeydown, this)
    this.cameras.main.setPostPipeline('CRTPipeline')
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
    const original = `ROOM: ${code}`
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

    UIFactory.createHeader(this, width / 2, 40, "LOBBY")

    this.roomCodeText = this.add
      .text(width - 20, 16, "", {
        fontFamily: THEME.fonts.header,
        fontSize: "18px",
        color: THEME.colors.warning
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })

    this.roomCodeText.on("pointerdown", () => this.copyRoomCode())
    this.roomCodeText.on("pointerover", () => {
      this.tweens.killTweensOf(this.roomCodeText)
      this.tweens.add({ targets: this.roomCodeText, scaleX: 1.06, scaleY: 1.06, duration: 120, ease: "Back.easeOut" })
    })
    this.roomCodeText.on("pointerout", () => {
      this.tweens.killTweensOf(this.roomCodeText)
      this.tweens.add({ targets: this.roomCodeText, scaleX: 1.0, scaleY: 1.0, duration: 80, ease: "Power1" })
    })

    // Player Panel
    UIFactory.createPanel(this, 170, 290, 300, 430)
    this.add.text(170, 85, "PLAYERS", {
      fontFamily: THEME.fonts.header,
      fontSize: "12px",
      color: THEME.colors.muted
    }).setOrigin(0.5)

    // Chat Panel
    UIFactory.createPanel(this, 570, 270, 340, 390)
    this.add.text(570, 85, "DATA STREAM", {
      fontFamily: THEME.fonts.header,
      fontSize: "12px",
      color: THEME.colors.muted
    }).setOrigin(0.5)

    this.chatLogText = this.add.text(405, 105, "", {
      fontFamily: THEME.fonts.body,
      fontSize: "14px",
      color: THEME.colors.text,
      wordWrap: { width: 320 },
      lineSpacing: 3,
    })

    // Chat input box
    this.chatInputRect = this.add.rectangle(570, 472, 340, 34, toHex(THEME.colors.black))
      .setStrokeStyle(1, toHex(THEME.colors.border))
      .setInteractive({ useHandCursor: true })
    this.chatInputRect.on("pointerdown", () => {
      if (this.inputMode !== "chat") {
        this.inputMode = "chat"
        this.typedChat = ""
        this.refreshChatCursor()
        this.refreshLobbyUI()
      }
    })
    this.chatInputText = this.add.text(410, 472, "", {
      fontFamily: THEME.fonts.body,
      fontSize: "15px",
      color: THEME.colors.white
    }).setOrigin(0, 0.5)

    this.settingsText = this.add
      .text(width / 2, 520, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color: THEME.colors.muted,
        align: "center"
      })
      .setOrigin(0.5)

    this.actionBtn = UIFactory.createButton(this, width / 2, 554, 300, 44, "READY (SPACE)", () => sendPlayerReady())
    this.actionText = (this.actionBtn.list[1] as Phaser.GameObjects.Text)

    this.hintText = this.add.text(width / 2, 588, "", {
      fontFamily: THEME.fonts.body,
      fontSize: "12px",
      color: THEME.colors.muted
    }).setOrigin(0.5)

    this.refreshLobbyUI()
  }

  private refreshLobbyUI() {
    if (!this.room?.state?.players) return
    const state = this.room.state
    const me = state.players.get(this.room.sessionId)

    this.roomCodeText?.setText(`ROOM: ${state.roomCode}`)

    this.playerEntries.forEach(t => t.destroy())
    this.playerEntries = []
    let py = 110
    state.players.forEach((p, id) => {
      const ch = CHARACTERS.find(c => c.id === p.characterId)
      const symbol = ch?.symbol ?? "?"
      const prefix = p.isGamemaster ? "★ " : "  "
      const suffix = p.isReady ? " [READY]" : p.isConnected ? "" : " (offline)"
      const label = `${prefix}${symbol} ${p.name}${suffix}`
      const isMe = id === this.room?.sessionId
      const meIsGM = state.players.get(this.room?.sessionId ?? "")?.isGamemaster ?? false
      const canTransfer = meIsGM && !p.isGamemaster

      const t = this.add.text(35, py, label, {
        fontFamily: THEME.fonts.body,
        fontSize: "18px",
        color: isMe ? THEME.colors.primary : THEME.colors.text,
      })
      if (canTransfer) {
        t.setInteractive({ useHandCursor: true })
        t.on("pointerover", () => t.setColor(THEME.colors.warning))
        t.on("pointerout", () => t.setColor(isMe ? THEME.colors.primary : THEME.colors.text))
        t.on("pointerdown", () => {
          sounds.menuConfirm()
          sendTransferGamemaster(id)
        })
      }
      this.playerEntries.push(t)
      py += 28
    })

    const chatLines = [...state.chatMessages]
      .slice(-14)
      .map((m) => `${state.players.get(m!.playerId)?.name ?? "?"}: ${m!.text}`)
    this.chatLogText?.setText(chatLines.join("\n"))

    const visibility = state.isPrivate ? "PRIVATE" : "PUBLIC"
    if (me?.isGamemaster) {
      this.settingsText?.setText(
        `[←/→] PLAYERS: ${state.maxPlayers}   [M] MODE: ${(state.gameMode ?? "olympiade").toUpperCase()}   ${visibility}`
      )
    } else {
      this.settingsText?.setText(
        `MODE: ${(state.gameMode ?? "olympiade").toUpperCase()}   PLAYERS: ${state.maxPlayers}   ${visibility}`
      )
    }

    const connected = [...state.players.values()].filter((p) => p.isConnected)
    const allReady = connected.length >= 2 && connected.every((p) => p.isReady)

    if (me?.isGamemaster && allReady) {
      this.actionText?.setText("SPACE — START GAME").setStyle({ color: THEME.colors.success })
    } else if (me?.isReady) {
      this.actionText?.setText("WAITING FOR OTHERS...").setStyle({ color: THEME.colors.muted })
    } else {
      this.actionText?.setText("SPACE — READY").setStyle({ color: THEME.colors.primary })
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
    this.chatInputRect?.setStrokeStyle(
      1,
      toHex(this.inputMode === "chat" ? THEME.colors.primary : THEME.colors.border)
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
        if (this.createMaxPlayers !== 2 || this.createGameMode !== "olympiade") {
          sendGamemasterSettings(this.createMaxPlayers, this.createGameMode)
        }
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
      this.add.text(cx, cy + 36, "Press ENTER to go back", { fontSize: "13px", color: THEME.colors.muted }).setOrigin(0.5)
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
