# Motion Choreography

Use motion to clarify state and hierarchy. Prefer one signature moment plus a
small number of supporting reveals over scattered effects.

## Motion Bucket Map (FE-MOTION-BUCKET-01)

Classify the surface before choosing scroll choreography:

| Surface | Motion guidance |
| --- | --- |
| Landing, campaign, editorial, portfolio | One signature scroll moment plus at least one supporting reveal; keep the total near 2-4 |
| Consumer apps, education, community | Feedback and state-transition motion only |
| Dashboards, admin, ops, finance, government, B2B tools | No scroll-driven motion; preserve restrained feedback and state transitions |
| Games and interactive art | Follow the domain |

The floor applies only to the base experience. Reduced-motion users and
unsupported browsers may receive a static final state.

## Implementation Rules

- Animate `transform` and `opacity` when possible.
- Enumerate transition properties; do not default to `transition-all`.
- Use one shared pointer listener per interactive cluster, scheduled through
  `requestAnimationFrame`, rather than one listener per child.
- Gate pointer-proximity effects behind `(hover: hover) and (pointer: fine)`.
- Disable non-essential movement under `prefers-reduced-motion: reduce`.
- Prefer CSS scroll-driven animations as progressive enhancement. Keep content
  visible and usable when the feature is unsupported.
- Never attach raw scroll listeners for effects when CSS timelines or a
  framework motion primitive can express the behavior.

## Motion Assets (FE-MOTION-VIDEO-01)

Use video only when motion itself communicates product meaning. Generate or
source a poster frame, reserve stable dimensions with `aspect-ratio`, and avoid
autoplay with sound. Respect reduced-motion preferences by showing the poster
or a static frame. Compress assets, lazy-load below-the-fold media, and verify
that playback does not cause layout shift.

## Verification

- Confirm the surface matches its motion bucket.
- Count distinct scroll-driven moments against FE-MOTION-BUCKET-01.
- Test keyboard use and focus while animation is active.
- Test reduced motion and the static fallback.
- Check mobile touch behavior and desktop pointer behavior separately.
- Confirm animation does not obscure text, controls, or state changes.
