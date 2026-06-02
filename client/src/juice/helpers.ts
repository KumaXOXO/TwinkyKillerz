import type Phaser from "phaser"
import type { JuiceConfig } from "./index"

type Scalable = Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number }

export function punch(cfg: JuiceConfig, obj: Scalable, scale = 1.18, ms = 120): void {
  if (!cfg.enabled) return
  const s = cfg.reduced ? 1 + (scale - 1) * 0.5 : scale
  const scene = (obj as unknown as { scene: Phaser.Scene }).scene
  scene.tweens.add({
    targets: obj,
    scaleX: s,
    scaleY: 1 / s,
    duration: ms * 0.4,
    ease: "Back.easeOut",
    yoyo: true,
    onComplete: () => { obj.scaleX = 1; obj.scaleY = 1 },
  })
}

export function shake(cfg: JuiceConfig, scene: Phaser.Scene, intensity = 0.006, ms = 150): void {
  if (!cfg.enabled) return
  scene.cameras.main.shake(ms, cfg.reduced ? intensity * 0.5 : intensity)
}

export function pop(
  cfg: JuiceConfig,
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 8,
): void {
  if (!cfg.enabled) return
  const n = cfg.reduced ? 2 : count
  const emitter = scene.add.particles(x, y, "__DEFAULT", {
    color: [color],
    speed: { min: 60, max: 140 },
    lifespan: 400,
    quantity: n,
    maxAliveParticles: n,
    gravityY: 200,
    scale: { start: 0.5, end: 0 },
    emitting: false,
  })
  emitter.explode(n, x, y)
  // destroy after burst completes — prevents dead emitter accumulation (T8)
  scene.time.delayedCall(500, () => emitter.destroy())
}

export function hitstop(cfg: JuiceConfig, scene: Phaser.Scene, ms = 60): Promise<void> {
  if (!cfg.enabled || cfg.reduced) return Promise.resolve()
  return new Promise<void>((resolve) => {
    scene.time.timeScale = 0
    // window.setTimeout: immune to scene.time.timeScale (real-clock restore)
    window.setTimeout(() => {
      if (scene.sys.isActive()) scene.time.timeScale = 1
      resolve()
    }, ms)
  })
}

export function slowmo(cfg: JuiceConfig, scene: Phaser.Scene, factor = 0.3, ms = 1500): Promise<void> {
  if (!cfg.enabled || cfg.reduced) return Promise.resolve()
  return new Promise<void>((resolve) => {
    scene.time.timeScale = factor
    window.setTimeout(() => {
      if (scene.sys.isActive()) scene.time.timeScale = 1
      resolve()
    }, ms)
  })
}
