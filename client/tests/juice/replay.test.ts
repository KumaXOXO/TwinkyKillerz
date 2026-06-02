import { describe, it, expect } from "vitest"
import { createRingBuffer, record } from "../../src/juice/replay"

describe("RingBuffer", () => {
  it("starts empty", () => {
    const buf = createRingBuffer<number>(3)
    expect(buf.items).toHaveLength(0)
    expect(buf.head).toBe(0)
  })

  it("records up to capacity without overwrite", () => {
    const buf = createRingBuffer<number>(3)
    record(buf, 1)
    record(buf, 2)
    expect(buf.items).toEqual([1, 2])
    expect(buf.head).toBe(2)
  })

  it("overwrites oldest item when full", () => {
    const buf = createRingBuffer<number>(3)
    record(buf, 1)
    record(buf, 2)
    record(buf, 3)
    record(buf, 4) // overwrites slot 0
    expect(buf.items).toHaveLength(3)
    expect(buf.items).toContain(4)
    expect(buf.items).not.toContain(1)
  })

  it("head wraps around modulo capacity", () => {
    const buf = createRingBuffer<number>(2)
    record(buf, 10)
    record(buf, 20)
    record(buf, 30)
    expect(buf.head).toBe(1)
  })

  it("works with object snapshots", () => {
    const buf = createRingBuffer<{ board: string[] }>(2)
    record(buf, { board: ["a"] })
    record(buf, { board: ["b"] })
    record(buf, { board: ["c"] }) // overwrites first
    expect(buf.items.some(s => s.board[0] === "c")).toBe(true)
    expect(buf.items.some(s => s.board[0] === "a")).toBe(false)
  })
})
