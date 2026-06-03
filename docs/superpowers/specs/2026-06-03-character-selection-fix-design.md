# Design Spec: Character Selection Refinement (Balatro Style)

## Context
The previous character selection implementation had sliding animation issues due to incorrect frame width calculations. Additionally, the user requested better readability for names, specific name changes for characters, and a reversion of the screen title and labels to maintain original brand identity while adding new "juice" like hover glows.

## 1. Visual & Typography
- **Title**: Change from "IDENTITY SELECTION" back to **"TWINKY GAMES"**.
    - Font: Standard Phaser Bold (Nostalgic branding).
- **Name Input Label**: "SELECT YOUR NAME".
- **Character Names**:
    - **Font**: `VT323` (Terminal style) for clarity.
    - **Size**: 24px (Significant increase).
    - **Style**: Uppercase, high-contrast colors matching character theme.

## 2. Character Data Refinement
The character IDs and names will be updated in `shared/constants.ts`:
- `lucas` -> "Blonde Podcaster"
- `fedor` -> "Geek Streamr"
- `christian` -> "Bearded Gamer"
- `dodo` -> "Lockiger zuschauer"
- `grhost` -> "Grinsender CO-Host"

## 3. Centered Animations
To fix the "sliding" sprites, each character sheet will be sliced with precise dimensions:
- **Sheet A (418x470 frames)**: Fedor, GR-Host, Robin, Ingo P. Female.
- **Sheet B (350x561 frames)**: Christian, Ingo P.
- **Sheet C (384x512 frames)**: Dodo.
- **Sheet D (342x574 frames)**: Lucas.

Each animation will use frames 0-3 (the first row) of their respective sheets.

## 4. Interaction & Juice
- **Hover State**:
    - Card Background: `setFillStyle(0xffffff, 0.4)` (Bright white glow).
    - Card Border: `setStrokeStyle(3, 0xffffff)`.
    - Animation: `sprite.play('anim_id')`.
- **Idle State**:
    - Card centers character frame.
    - Subtle floating tween (`y` axis).

## 5. Modular Grid Logic
- The grid will support dynamic character counts.
- `MAX_COLS = 3`.
- **Dynamic Centering**: Each row will calculate its own horizontal starting point based on the number of items in that specific row. This ensures the last row is always centered if it has fewer than 3 items.

## Verification
- Run game and hover over characters.
- Verify sprites stay centered during animation (no sliding).
- Verify names are legible and title is correct.
- Test adding/removing a character from constants to ensure grid adjusts.
