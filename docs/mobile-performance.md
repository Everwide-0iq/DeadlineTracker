# Mobile UI and rendering checks

## Changes

- Collapsible project picker with full names and retained management actions.
- Secondary account controls moved into a compact disclosure.
- 44px card action targets and 16px mobile form inputs.
- Mobile cards use content-visibility with an intrinsic height estimate. Cards
  remain mounted so dialogs, focus, and reminder deep links keep their targets.
- No backdrop blur on mobile cards; deadline colors and active state remain.
- Mobile card images request signed URLs only within 600px of the viewport,
  using a shared IntersectionObserver with cleanup and an eager fallback.
- The board clock skips hidden-tab updates and refreshes immediately on return.

## Verification (2026-09-19)

- npm run check: typecheck, lint, 87 unit tests, 237 isolated SQL checks, build.
- Browser screenshots: 320, 390, 768, and 1440px; no document horizontal overflow.
- At 390px the header height decreased from 374px to 270px.
- Project switching, card creation form, reminder dialog, and image loading
  after scrolling checked without saving changes to real cards.
- Synthetic 200-card list, 100 animation-frame scroll steps: median frame gap
  13.9ms, p95 21.9ms. Desktop Chromium with a mobile viewport, development build;
  this is a smoke test, not a physical-phone benchmark or a before/after FPS claim.
- Test rows injected only into a browser GET response, then the route removed
  and the app reloaded. No production database writes.

## Remaining scale boundaries

Content visibility reduces layout and paint work, not React mounts or the size
of the initial card query. The app still loads accessible cards for cross-project
counts and board features. Large-team scaling needs a separate measured change:
server-side summaries plus project-scoped loading, with tests for switching,
revoked permissions, realtime reconciliation, and exports. Do not simply limit
the current query, which would silently hide tasks and break counts.

The existing lazy Arcade bundle still triggers the build size warning. No new
dependencies or schema changes were introduced by this mobile pass.

Before release, also check on physical iOS/Android devices: keyboard opening,
safe areas, long descriptions, private-image loading, and scroll responsiveness.
