import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { initJuice } from "../../src/juice/index"

describe("initJuice", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("defaults: enabled=true, reduced=false, debug=false", () => {
    const cfg = initJuice()
    expect(cfg.enabled).toBe(true)
    expect(cfg.reduced).toBe(false)
    expect(cfg.debug).toBe(false)
  })

  it("juice=off → enabled=false", () => {
    localStorage.setItem("juice", "off")
    expect(initJuice().enabled).toBe(false)
  })

  it("juice=reduced → reduced=true, still enabled", () => {
    localStorage.setItem("juice", "reduced")
    const cfg = initJuice()
    expect(cfg.enabled).toBe(true)
    expect(cfg.reduced).toBe(true)
  })

  it("juiceDebug=on → debug=true", () => {
    localStorage.setItem("juiceDebug", "on")
    expect(initJuice().debug).toBe(true)
  })

  it("prefers-reduced-motion → reduced=true", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    expect(initJuice().reduced).toBe(true)
  })

  it("config is frozen (immutable)", () => {
    const cfg = initJuice()
    expect(() => {
      ;(cfg as { enabled: boolean }).enabled = false
    }).toThrow()
  })
})
