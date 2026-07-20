# Image Resolution (OAuth path) — Temporary Limitation

OAuth (ChatGPT subscription / Codex backend) image generation has a backend-imposed
resolution behavior. This is documented here because it is a **temporary limitation
and the future direction is undecided**.

## Behavior

- **Aspect ratio is honored** exactly per the requested `size`. The prompt carries a
  directive (`You MUST generate this image at exactly WxH resolution as a TALL vertical
  PORTRAIT / WIDE horizontal LANDSCAPE / SQUARE canvas`), so portrait/landscape/square
  come out with the correct orientation.
- **Total pixels are capped at ~1.57M** (≈ 1024×1536) by the OAuth backend. 1K presets
  are exact; larger requests keep the aspect ratio but scale down.

| requested `size` | actual PNG (OAuth) | note |
|---|---|---|
| 1024×1536 (portrait) | 1024×1536 | exact |
| 1536×1024 (landscape) | 1536×1024 | exact |
| 2048×1152 (16:9) | 1672×941 | aspect kept, scaled to ~1.57M |
| 2048×2048 (square) | 1254×1254 | aspect kept, scaled |

## If you need exact large pixels

Use the **API-key path** (`/images/generations`, `gpt-image` — arbitrary resolutions up
to 3840×2160). The OAuth path is free (ChatGPT subscription) but pixel-capped.

> Verified by server `/api/generate` E2E on 2026-06-27.
> **This is a temporary limitation; the future direction is undecided.**
