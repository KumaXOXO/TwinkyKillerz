export const THEME = {
  colors: {
    bg: '#0d0221',
    panel: '#16162a',
    border: '#3a2a6e',
    primary: '#ff006e',
    secondary: '#8338ec',
    success: '#3a86ff',
    warning: '#ffbe0b',
    text: '#e8d5ff',
    muted: '#7070a0',
    white: '#ffffff',
    black: '#000000',
    segments: ['#ff006e', '#8338ec', '#3a86ff', '#ffbe0b', '#00f5d4'],
  },
  fonts: {
    header: '"Press Start 2P", cursive',
    body: '"VT323", monospace',
  }
};

export function toHex(color: number | string): number {
  if (typeof color === 'number') return color;
  return parseInt(color.replace('#', ''), 16);
}
