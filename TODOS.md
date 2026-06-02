# TODOS

## rexUI evaluation for spring physics

**What:** Evaluate `@rexrainbow/phaser3-rex-plugins` spring/anchor behaviors as a drop-in replacement for custom `punch()` if native Phaser tweens prove insufficient.

**Why:** Balatro tactile feel requires spring physics — "squishy" on piece-land. Native `Back.easeOut` tween covers ~90% of this. If 30 minutes of knob-tuning can't reach "squishy" after shipping `helpers.ts`, rexUI covers the gap without rewriting the helpers.

**Trigger:** During implementation step 3 (Wire Connect4 chip-drop), spend max 45min on tuning. If punch() still feels stiff, evaluate rexUI.

**Start:** `npm install phaser3-rex-plugins` then replace `helpers.ts:punch` with rex anchor behavior then test Connect4 drop feel.

**Blocked by:** Implementation of helpers.ts (Tasks T1-T3 must ship first).
