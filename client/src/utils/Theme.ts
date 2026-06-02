/** Convert CSS hex string to Phaser number. Use for fillStyle/setStrokeStyle/lineStyle. */
export function toHex(color: string): number {
  return parseInt(color.slice(1), 16)
}

export const THEME = {
  colors: {
    bg:        '#0d0221',
    panel:     '#16162a',
    border:    '#3a2a6e',
    primary:   '#ff006e',
    secondary: '#8338ec',
    success:   '#3a86ff',
    warning:   '#ffbe0b',
    text:      '#e8d5ff',
    muted:     '#7070a0',
    white:     '#ffffff',
    black:     '#000000',
  },
  fonts: {
    header: '"Press Start 2P", cursive',
    body:   '"VT323", monospace',
  },
}
