# Anti-Slop — Banned AI Design Patterns (2026)

Specific patterns that mark output as "AI-generated." Comprehensive audit checklist
for any frontend surface built with ima2 assets.

---

## Typography Slop Signals
- Unexamined default typography: browser defaults, framework defaults, or "Inter everywhere" without a reason
- Latin-first font choices applied to Hangul without testing CJK rhythm, line-height, and fallback
- Space Grotesk as the automatic "anti-Inter" choice
- System stacks as a shortcut instead of a deliberate product typography decision

**Allowed when intentional**: `system-ui`, `-apple-system`, Pretendard, SUIT, Noto Sans KR, Apple SD Gothic Neo.

**Do instead**: choose a domain-appropriate stack. Korean-first: CJK-safe product stack. Latin display: Geist, Outfit, Cabinet Grotesk, Satoshi, Clash Display, GT America, or Neue Machina.

## Typography Audit
- **Inter everywhere** -> deliberate stack for product and locale
- **Headlines lack presence** -> increase size, tighten letter-spacing, reduce line-height
- **Body too wide** -> limit to ~65ch, increase line-height
- **Only 400 + 700** -> introduce 500, 600, or extremes (100 vs 900)
- **Proportional numbers in data** -> `font-variant-numeric: tabular-nums`
- **Missing letter-spacing** -> negative for large headers, positive for small caps
- **All-caps everywhere** -> sentence case, small-caps, or lowercase italic
- **Orphaned words** -> `text-wrap: balance` or `text-wrap: pretty`
- **No `text-wrap`** -> apply `balance` globally to h1-h6 (see `typography-wrapping.md`)
- **No `max-width` in `ch`** -> h1: 50ch, h2: 55ch, p: 65ch
- **Heading breaks mid-phrase** -> review at 390px, 768px, 1440px
- **Body exceeding 75 chars** -> `max-width: 65ch`

---

## Banned Color Patterns
- Gradient soup: the 2026 #1 AI tell. Layered gradient washes, gradient cards, gradient borders, and glow soup
- Purple gradient on white background
- Blue-to-indigo gradient buttons
- Oversaturated neon accents (saturation < 80%)
- Equally distributed pastel rainbows
- Pure black `#000000` -> off-black (`#0a0a0a`, Zinc-950)
- Mixing warm and cool grays in same project
- Generic box-shadow -> tint shadows to background hue

**Do instead**: Zinc/Slate neutral base + ONE high-contrast accent.

## Gradient Budget (FE-GRADIENT-01, DEFAULT)

- Max 1 ambient gradient per viewport
- No gradients on 3+ sibling cards
- Background + card gradients + gradient borders + glow stacked = gradient soup
- Radial glows behind dark heroes are decorative filler unless they model a real light source
- Every gradient must encode something: depth, light, state, or one brand moment

### Opaque Functional Surfaces (FE-GRADIENT-02, DEFAULT)

Tinted gradient wash on an OPAQUE functional panel (cards, panels, sidebars,
badges, buttons inside tools) is product-UI gradient soup. It reads as dated
marketing chrome: color as decoration, contrast varies top-to-bottom.

Decision rule:
- Ambient/expressive/translucent -> gradient allowed for mood/light/depth/material
- Opaque + functional (cards, panels, task UI) -> NO gradient. Emphasize with
  ONE channel: flat tint | 1px border | accent bar | elevation shadow | status token

## One-Note Theme Ban (FE-ONENOTE-01, DEFAULT)

Full-page single-hue theming where bg, borders, text, badges, glows, and imagery
all resolve to one hue family.

- Terminal green / Matrix hacker = #1 dark-mode tell
- Cyber cyan, retro CRT amber, synthwave magenta
- Check: sample 5 random UI elements; if 4+ share one hue +/-30 deg = one-note
- Generated imagery color-matched to theme hue compounds the problem

**Do instead**: neutral dark (Zinc-950/`#0a0a0a`) + ONE accent at <10% surface area.

## Premium-Consumer Palette Ban (DEFAULT)

For premium-consumer briefs (cookware, wellness, artisan, luxury, heritage):

**Banned backgrounds**: `#f5f1ea` `#f7f5f1` `#fbf8f1` `#efeae0` `#faf7f1`
**Banned accents**: `#b08947` `#b6553a` `#9a2436` `#9c6e2a`
**Banned text**: `#1a1714` `#1b1814`

Override ONLY when the brand brief explicitly names warm beige/cream.

---

## Banned Layouts
- Everything centered with uniform padding
- Oversized bold hero inside tools, dashboards, admin, finance
- 3 equal cards in a row (the "feature row" cliche)
- Uniform rounded corners on every element
- Centered hero + gradient background + Inter heading
- Card-heavy dashboards where every metric is boxed
- Complex flexbox calc -> CSS Grid
- `height: 100vh` -> `min-height: 100dvh`
- No max-width -> `max-w-7xl mx-auto`
- Cards forced to equal height -> allow variable or masonry
- Dashboard always left sidebar -> try top nav, command menu, collapsible
- Symmetrical vertical padding -> bottom often needs slightly larger (optical)

## 2026 Product Slop
- Asset-free pages: gradients, blobs, generic icons where product/screenshot/diagram needed
- Use `ima2 gen` to create real visual assets instead of CSS gradient washes
- Fake dashboards with random numbers
- Landing-page composition inside repeated-work tools
- AI tool surfaces without pending, cancel, retry, undo, provenance states
- Trust-heavy domains using playful visuals without purpose
- Soft 3D miniatures from generic icon packs without brand adaptation
- Giant centered Korean headlines as decoration rather than hierarchy

## AI Tell Patterns

- Version labels in heroes (V0.6, BETA, INVITE-ONLY)
- Section-number eyebrows (001 - Capabilities)
- Middle-dot overuse: max 1 per metadata line
- "Quietly trusted by" social-proof headers
- Weather/locale strips unless genuinely place-focused
- Scroll cues ("scroll to explore")
- Decorative dots before nav items
- Photo-credit captions on AI-generated images
- Fake product previews from styled divs
- Version footers on marketing pages
- Same generated image used twice on one page
- Monospace uppercase micro-labels on every card

### Self-Describing Meta Copy (FE-METACOPY-01, DEFAULT)

UI copy must describe the product/user job, never the mockup, layout, or
responsive behavior.

- "벤토 보드에 겹쳐 보여주는 목업" = meta copy (banned)
- "작은 화면에서 단일 열로 접힙니다" = meta copy (banned)
- Cards named after design artifacts (VIEWPORT MATRIX) = meta copy (banned)

**Test**: could a real user say what job this element does for them?

---

## Emoji Slop (STRICT)

Emoji as visual elements is the strongest AI tell in 2026. Human designers
never ship emoji as feature icons or section markers in production UI.

| Context | Verdict | Do Instead |
|---------|---------|------------|
| Feature card icons | **BANNED** | Lucide/Phosphor/Heroicons SVG |
| Section headers | **BANNED** | Typographic hierarchy or icon |
| Button labels | **BANNED** | Text only, or SVG + text |
| Chat/messaging content | Allowed | User-generated content exempt |
| CLI output | Allowed | Functional indicators OK |

---

## Banned Logo/Integration Patterns
- Generic stroke icons as brand logos -> use actual SVGs from Simple Icons, SVGL, or press kits (see `brand-asset-sourcing.md`)
- Individual hover on non-clickable logo walls -> trust signals, not navigation
- Grid with orphan cells -> flexbox center or marquee
- Static grid for 8+ logos -> CSS marquee (30-40s, linear)
- Missing `prefers-reduced-motion` on marquee
- Missing edge fade on marquee

## Korean Slop
- Translationese: "원활한 경험을 제공합니다", "혁신적인 솔루션"
- Bureaucratic labels where simple Korean works
- Korean text clipped in fixed-width buttons
- Negative letter-spacing on Hangul without testing
- Cute visuals as Korean default (domain decision, not locale decision)
- Oversized ultra-bold Hangul hero: 100px+ / 800-900 weight on Korean reads as heavy mass
  Korean premium: 56-72px / 700 / line-height 1.25-1.4
- Split-hero template (FE-HERO-SPLIT-01): left headline + right boxed screenshot is exhausted
  Default: product visual is the stage, not a right-column card
- "Tasteslop" serif shortcut: serif purely as AI-premium signal without editorial structure

---

## Banned Interaction Patterns
- Generic circular spinners -> skeleton loaders matching layout
- Default browser focus rings -> `focus-visible:ring-2`
- Custom cursors (outdated, a11y issue)
- Neon/outer glow box-shadow
- No hover states -> add background shift, scale, or translate
- No pressed feedback -> `scale(0.98)` or `translateY(1px)`
- Zero-duration transitions -> 200-300ms
- Dead `#` links -> real destinations or visually disable
- Scroll jumping -> `scroll-behavior: smooth`
- Animations using top/left/width/height -> transform+opacity

## Banned Content ("Jane Doe" Effect)
- Generic names: "John Doe", "Sarah Chan"
- Generic companies: "Acme", "Nexus", "SmartFlow"
- Predictable numbers: `99.99%`, `$9.99`
- AI copywriting: "Elevate", "Seamless", "Unleash", "Next-Gen", "Delve"
- Exclamation in success messages -> confident, not loud
- "Oops!" errors -> "Connection failed. Please try again."
- Lorem Ipsum -> write real draft copy
- Title Case On Every Header -> sentence case

## Banned Component Defaults
- shadcn in default state -> customize radii, colors, shadows
- Default Tailwind blue as primary
- Lucide egg avatar -> picsum.photos or SVG UI Avatars
- 3-card carousel testimonials -> masonry, embedded social, rotating quote
- Modals for everything -> inline editing, slide-over, expandable
- Sun/moon dark mode toggle -> dropdown or system preference
- 4-column footer link farm -> simplify

## Soft 3D / Character Asset Slop
Not banned by default, but must pass `soft-3d-asset-gates.md`.

Slop: generic pack, random cute object, inconsistent lighting, low-polish AI
output, decorative overload, asset competing with headline.

---

## Strategic Omissions (What AI Forgets)
- No legal links in footer
- No "back" navigation (dead ends)
- No custom 404 page
- No form validation
- No skip-to-content link
- Random dark sections in light page -> commit to one theme

## Anti-Convergence Rule

Each generation MUST be visually distinct from the last:
- Different font pairing
- Different aesthetic archetype
- Alternate light/dark themes
- Vary layout patterns

## Redesign Fix Priority

1. **Font swap** (biggest instant improvement)
2. **Color palette cleanup**
3. **Hover + active states**
4. **Layout + spacing**
5. **Replace generic components**
6. **Add loading/empty/error states**
7. **Polish typography scale**
