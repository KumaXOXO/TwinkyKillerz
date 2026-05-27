export const CHIP_FIXED_PCT = 1 // 1% probability per chip

export function computeSegmentWeights(
  fieldCount: number,
  chipsPerField: number[]
): number[] {
  if (fieldCount === 0) return []
  const totalFixed = chipsPerField.reduce((s, c) => s + c, 0)
  // Cap fixed at 80% so base probability never reaches zero
  const fixedPct = Math.min(totalFixed * CHIP_FIXED_PCT, 80)
  const variablePct = 100 - fixedPct
  const basePerField = variablePct / fieldCount
  return chipsPerField.map(chips => basePerField + chips * CHIP_FIXED_PCT)
}

export function pickWeightedIndex(weights: number[]): number {
  if (weights.length === 0) return 0
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}
