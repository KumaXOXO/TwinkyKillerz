import type Phaser from "phaser"

export interface RingBuffer<T> {
  capacity: number
  items: T[]
  head: number
}

export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  return { capacity, items: [], head: 0 }
}

export function record<T>(buf: RingBuffer<T>, item: T): void {
  if (buf.items.length < buf.capacity) {
    buf.items.push(item)
  } else {
    buf.items[buf.head] = item
  }
  buf.head = (buf.head + 1) % buf.capacity
}

// Replay is game-specific. Caller provides buffer + container when wiring
// slow-motion replay per scene. No-op until then.
export async function playback(
  _scene: Phaser.Scene,
  _container: Phaser.GameObjects.Container,
  _buffer: RingBuffer<unknown>,
  _factor: number,
): Promise<void> {}
