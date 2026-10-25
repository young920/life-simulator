# Design QA — 《你想活出怎样的人生》

**Acceptance gate:** at least 80% visual similarity to the selected Product Design mock.

**Final result: passed**  
**Manual visual similarity estimate: 87/100** — above the 80% acceptance gate. This is a structured visual-review score, not an automated pixel/SSIM measurement.

## Comparison setup

- **Selected source:** `evidence/selected-star-atlas-design.png`, 853 × 1844 px.
- **Rendered implementation:** `evidence/world-setup-screen.png`, captured from `[data-testid="device-screen"]` at 1×. The CSS device screen measured 393 × 852 px; the saved PNG is 394 × 852 px because of screenshot edge rounding.
- **Normalization:** source and implementation have the same portrait aspect ratio (about 0.4625). Compared at matching screen proportions. Product-owned content was assessed separately from the mobile runtime's status bar and device chrome.
- **State:** initial world editor; modern setting, 修行者, and 实力至上 selected in both designs.
- **Full-view evidence:** source and implementation were opened side by side in the same comparison input. See `evidence/selected-star-atlas-design.png` and `evidence/world-setup-screen.png`.
- **Focused regions:** the title/map region and lower settings/CTA region were both legible in the full-screen comparison; separate crops were not needed.

## Visual score

| Surface | Score | Evidence |
|---|---:|---|
| Main composition and hierarchy | 23/25 | Full-width star atlas fills roughly the upper half; title, world markers, settings panel, selection rows, and main CTA follow the reference order. |
| Palette and illustration | 21/25 | Deep indigo, jade/cyan highlights, antique gold, floating worlds, and night-sky imagery match. The generated landscape composition differs from the mock's exact skyline and island arrangement. |
| Typography | 13/15 | Chinese title, serif display hierarchy, and compact UI copy follow the reference. The implementation uses a live font instead of the mock's exact brush lettering. |
| Controls and content | 22/25 | World description, era tiles, identity, aspiration, and “开始这一世” appear together on the same screen with working selection states. |
| Spacing and density | 8/10 | Similar portrait density and bottom CTA placement; wording and chip widths vary slightly. |
| **Total** | **87/100** | **Passes the 80% threshold.** |

## Findings

No actionable P0, P1, or P2 visual findings remain.

### Iteration history

1. **First implementation:** the world art appeared as a short framed card below a separate heading, while identity and aspiration were deferred to a later page. This was a major layout mismatch with the selected source. **Fix:** changed the first screen to a full-width star atlas and moved the world prompt, era choices, identity, aspiration, and primary action into the same screen. The earlier state is retained as `evidence/first-draft-world-screen.png`.
2. **Selection consistency review:** map preset highlights could become stale after freeform edits, and map themes were coupled to the era picker. **Fix:** map selection now reflects the current world description; era selection remains its own control and is included in the life narration.
3. **Post-fix comparison:** repeated the 1× screen capture and compared it with the selected mock. The score above reflects this final capture.

## Interaction and runtime checks

- World map presets update the world description and selected marker.
- Editing the world description clears unrelated preset selection.
- Era, identity, and aspiration selections expose their selected state and operate independently.
- Custom era entry applies to the world preview.
- The flow reaches the destiny preview, event choices, relationship sheet, a second chapter, and a terminal life summary.
- Switching event choices updates the displayed consequences and attributes deterministically.
- Browser console: 0 errors.
- `npm run build`: passed; the mobile runtime integrity check also passed.

## Follow-up polish

The exact brush lettering and exact painted map composition in the selected mock are not reproduced pixel-for-pixel. They are the remaining visible differences; the main layout, palette, screen density, controls, and action placement match the selected direction.

## Latest home reference restoration — 2026-10-25

- **Selected source:** the user's latest home-screen design, archived unchanged as `public/assets/game/world-home-reference.png` (853 × 1844 px).
- **Rendered implementation:** `evidence/world-home-reference-implementation.png`, captured from `[data-testid="device-screen"]`; the CSS screen measures 393 × 852 px.
- **Visual approach:** use the supplied art as the full-screen visual layer, with live controls aligned over it. The world description field masks its baked sample text and renders the current editable value; the character count is live. Map hotspots, random inspiration, era, identity, aspiration, custom era, resume, and start actions remain accessible controls.
- **Runtime fit:** the visual stage begins 2.5% below the screen top so the preserved live status bar does not cover the title. The remaining design composition scales to fill the screen.
- **Manual visual similarity estimate: 94/100.** This is a human estimate, not pixel/SSIM analysis. The visual source is the supplied raster, so the illustration and typography are preserved exactly; the small status-bar offset and live input/selection overlays are the visible differences.

### Interaction check

- World hotspot selects the matching world description; random inspiration chooses another world.
- Era, identity, and aspiration controls update their selected states independently.
- The world input accepts text and updates its 60-character count.
- The main action advances into the identity setup page.
- Browser page errors during the check: 0.

## Single-page responsive setup — 2026-10-25

This section supersedes the prior full-image overlay and its 94/100 estimate. The second setup/preview pages were removed from the opening flow. The atlas image is now cropped to the upper world map; the world field, era cards, identity, aspiration, advanced settings, and primary action are responsive live controls below it.

- **Rendered evidence:** `evidence/home-single-step-random-options.png` (iPhone preview; 393 × 852 CSS screen inside the device frame).
- **Behavior:** both identity and aspiration end with a “随机” action. It picks a concrete option, highlights it, announces the result, and sends that concrete value in the generation request. Name reroll, optional cast notes, keyboard visibility, and collapse dismissal were checked in the browser.
- **Home-to-life flow:** a real model-generated plan entered the progress screen and automatically opened age 0. The same generated run was advanced through choices at ages 8, 18, 30, 50, and 75 to the 100-year ending; the ending displayed encountered characters and the share action.
- **Manual visual similarity estimate: 84/100.** Composition 22/25, palette/art 21/25, typography 12/15, controls/content 21/25, spacing/density 8/10. The original atlas artwork is retained in the hero crop. Live control labels, image tiles, and the simpler CTA differ from the embedded artwork. This is a human comparison estimate, not a pixel/SSIM metric.

## Immersive life conversation — 2026-10-25

- **Rendered evidence:** `evidence/life-conversation-ending.png`, iPhone preview.
- The story view now keeps year cards, choice cards, and the life ending in one chronological paper-slip feed. New card copy types in. Subtle printer ticks use Web Audio, start off, and have a visible toggle.
- Auto progression starts after plan generation. It stops at each generated decision and resumes after a choice; the player can pause, select 0.5×/1×/2×, advance one year, or jump to the next milestone.
- An event card provides an on-demand Agnes image action. Real-browser generation succeeded, with the result shown inside its event card.
- Real-model browser run reached age 100 automatically at 4×, kept 100 chronological history cards, stopped at all five choices, and showed the encountered-character reflection and share action at the end. Manual pause and one-year advance were also verified.

## Slower year cards and tailored imagery — 2026-10-25

- Default auto speed is now 0.5×. The timeline labels use “第1年、第2年…”, matching the player's requested year-based framing.
- Year cards no longer show a row of changing stat numbers. Each card keeps the detailed scene above and a highlighted one-line key point at the bottom.
- The text plan includes eight additional concrete annual memories between the five decision events. Remaining years use varied world-aware copy.
- Every plan now generates a portrait, world-specific life cover before opening the first year. Key-event images are generated for that event only when the player requests them; empty event art uses a titled placeholder instead of reusing a mismatched default scene.
