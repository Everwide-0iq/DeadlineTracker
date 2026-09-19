# Desktop camera rendering (2026-09-19)

## Bottlenecks and changes

The camera's animation-frame handler wrote inherited scene CSS variables on
every frame. This invalidated styles throughout the board subtree. It also
repainted the grid via background-position. The minimap subscribed to every
live camera update in React, rebuilding node geometry and styles each frame.

- Camera frames now change only the world transform and a bounded grid-layer
  transform. Grid background-size changes only when zoom changes. Decorative
  scene parallax updates at camera commit, not during the gesture.
- The minimap subscribes imperatively to camera motion and moves its viewport
  marker. Node bounds are recomputed on committed camera/content changes.
  The marker continues moving live; the map no longer rescales on every frame.
- Grid coordinates retain their original phase, including negative positions.
- No data, access policy, realtime subscription, or mobile styling changes.

## Measurements

Local Chromium, development build, 1600x1000, normal visual mode. Same project,
camera at 100% zoom, seven rendered cards. A 180-frame synthetic pointer pan
follows x=900+sin(i/18)*230, y=500+cos(i/18)*90, then returns to its start.
Chrome DevTools Protocol Performance metrics recorded around the gesture.

| Metric | Before | After |
| --- | ---: | ---: |
| Median animation-frame interval | 11.0ms | 6.9ms |
| p95 interval | 15.8ms | 7.2ms |
| Frames over 25ms | 1 | 0 |
| Recalculate style duration | 1.300s | 0.040s |
| Layout count | 180 | 2 |
| Script duration | 0.404s | 0.038s |
| Main-thread task duration | 2.062s | 0.281s |

Additional smoke measurements after the change:

- Same scene with 4x CPU throttling: median 7.8ms, p95 16.8ms, 6/180 frames
  over 25ms. Throttling does not emulate a weak GPU or a complete weak device.
- 100 synthetic visible cards, 25% zoom: median 7.5ms, p95 12ms, 4/180 frames
  over 25ms. Cards injected into a GET response in an isolated browser tab;
  no database writes. Test tab closed and camera storage restored afterwards.

These are short requestAnimationFrame / main-thread measurements, not a promise
of sustained presented FPS. Images, links, display refresh rate, GPU, browser,
and collaboration activity can change results. 140 FPS needs roughly 7.14ms
per frame; 60 FPS needs 16.67ms. There are still outliers in the stress tests.

## Regression checks

- Grid unit tests: negative coordinates, periodicity, zoom density limits.
- Live minimap marker movement before pointer release.
- Pan, zoom, minimap navigation, and viewport clipping visually checked.
- Full npm run check: 89 unit tests, 237 isolated SQL checks, lint, types, build.
