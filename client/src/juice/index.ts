export type JuiceConfig = Readonly<{ enabled: boolean; reduced: boolean; debug: boolean }>

export const replayLock = { active: false }

export function initJuice(): JuiceConfig {
  const flag = localStorage.getItem("juice")
  const off = flag === "off"
  const reduced =
    flag === "reduced" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const debug = localStorage.getItem("juiceDebug") === "on"
  return Object.freeze({ enabled: !off, reduced, debug })
}
