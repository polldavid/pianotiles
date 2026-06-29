# 🎹 Tippy Tiles — Piano Tiles for Toddlers

A gentle, toddler-friendly take on Piano Tiles. Big bright tiles drift down
the screen; tap one to pop it, hear a happy piano note, and watch the stars
fly. Designed so little kids can't "lose" — there are no timing windows and
no game over.

## How to play

1. Open `index.html` in any modern browser (works great on a phone or tablet).
2. Press **▶ Play**.
3. Tap the colourful tiles as they float down. Each tap plays a friendly note
   and adds a ⭐.

That's it — missed tiles simply float away, so nobody gets frustrated.

## Toddler-friendly design choices

- **No game over / no penalties.** Missed tiles drift off the bottom harmlessly.
- **Forgiving taps.** Tap anywhere on a tile — no precise timing required.
- **Big targets & bright colours.** Easy for small fingers and developing eyes.
- **Happy sounds only.** Notes come from a C-major pentatonic scale, so every
  tap sounds nice together.
- **Two speeds.** 🐢 Easy and 🐰 Faster.
- **Lock-down touches.** Pinch-zoom, double-tap-zoom and scrolling are disabled
  so curious taps don't mess up the screen.
- **Sound toggle** for quiet time, and a 🏠 button to go back.

## Tech

Plain HTML, CSS, and JavaScript — no build step, no dependencies, no network
required. Sounds are generated live with the Web Audio API, and animations use
CSS, so the whole game is three small files.

- `index.html` — markup and screens
- `style.css` — styling and animations
- `game.js` — game logic and sound
