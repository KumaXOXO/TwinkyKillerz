import type Phaser from "phaser"
import type { JuiceConfig } from "./index"
import { replayLock } from "./index"
import { hitstop, shake, pop, slowmo } from "./helpers"
import { playback } from "./replay"
import type { RingBuffer } from "./replay"

export interface ClimaxOpts {
  hitstopMs?: number
  shake?: { intensity?: number; ms?: number }
  pop?: { x: number; y: number; color: number; count?: number }
  slowmo?: { factor?: number; ms?: number; buffer?: RingBuffer<unknown>; container?: Phaser.GameObjects.Container }
}

// Sequence: hitstop → await → shake + pop → slow-mo.
// hitstop-first prevents frozen-tween avalanche on timeScale restore.
export async function climax(
  cfg: JuiceConfig,
  scene: Phaser.Scene,
  opts: ClimaxOpts = {},
): Promise<void> {
  if (!cfg.enabled) return
  if (replayLock.active) return

  await hitstop(cfg, scene, opts.hitstopMs ?? 60)

  if (opts.shake) shake(cfg, scene, opts.shake.intensity, opts.shake.ms)
  if (opts.pop) pop(cfg, scene, opts.pop.x, opts.pop.y, opts.pop.color, opts.pop.count)

  if (opts.slowmo) {
    const { factor = 0.3, ms = 1500, buffer, container } = opts.slowmo
    replayLock.active = true
    try {
      await slowmo(cfg, scene, factor, ms)
      if (buffer && container) await playback(scene, container, buffer, factor)
    } finally {
      replayLock.active = false
    }
  }
}
