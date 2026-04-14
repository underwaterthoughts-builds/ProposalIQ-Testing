# Design System: The Sovereign Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Modern Archivist"**
This design system moves away from the "SaaS-standard" look to embrace the weight and authority of high-end editorial publishing. It is built on the philosophy that true luxury is found in restraint, precision, and the confident use of space. 

By eschewing common digital trends like glassmorphism and gradients, we lean into **"The Modern Archivist"**—an aesthetic that feels like a bespoke digital broadsheet. We break the grid through intentional asymmetry, using oversized serif typography to anchor the eye while functional elements remain tucked away in disciplined, monochromatic utility. The goal is a "high-trust" environment where the interface recedes to let the content command respect.

---

## 2. Colors
Our palette is rooted in the deep, ink-like shadows of a private library, accented by gold tones that suggest value without vanity.

### The "No-Line" Rule
**Borders are a failure of hierarchy.** Within this system, 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts. A section begins where the `surface` ends and a `surface-container-low` begins. This creates a seamless, "molded" look rather than a fragmented one.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of premium cardstock.
*   **Base Layer:** `surface` (#141311) for the widest layout containers.
*   **The Inset:** Use `surface-container-lowest` (#0f0e0c) to create "wells" of deep ink for focused reading.
*   **The Lift:** Use `surface-container-high` (#2b2a27) for interactive elements like cards or modals.
*   **Nesting Principle:** Never place a surface of the same tier inside itself. If you have a `surface-container-low` section, any cards inside it must be `surface-container-highest` to provide the necessary "tonal lift."

### Color Logic
*   **Primary (`#e8c357` / `#b8962e`):** Reserved for "The Final Action." Use sparingly to maintain its prestige.
*   **The Ink (`#141311`):** Our core atmosphere. It is not true black (#000), but a warm, organic charcoal that prevents eye strain.
*   **On-Surface-Variant (`#d0c5b0`):** Use this for secondary text to ensure the gold accents remain the only high-chroma elements on the screen.

---

## 3. Typography
The system uses a "Dual-Tone" typographic approach: the Authority of the Serif and the Precision of the Sans-Serif.

*   **Display & Headlines (Newsreader/Serif):** These are our "Voice of God." They should be set with generous leading and tight letter-spacing. Use `display-lg` for hero moments to create a "Masthead" feel.
*   **Body (Manrope/Sans-Serif):** While the original request suggested Segoe UI, we utilize **Manrope** for its more geometric, premium feel that pairs better with high-end serifs. It handles functional UI and long-form reading with equal clarity.
*   **Labels (Space Grotesk/Monospace):** Data, timestamps, and metadata must feel like they were stamped by a machine. Use `label-md` for "Data Labels" to provide a technical contrast to the editorial headings.

---

## 4. Elevation & Depth
In a system that forbids gradients and glass, depth is a game of **Tonal Layering.**

*   **The Layering Principle:** Depth is achieved by "stacking" surface-container tiers. Placing a `surface-container-lowest` card on a `surface-container-low` section creates a soft, natural "recess" effect.
*   **Ambient Shadows:** Floating elements (like dropdowns) use a shadow color tinted with our gold-secondary (`#745b00`) at 6% opacity. This mimics a warm light source hitting a dark surface.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in forms, use `outline-variant` (#4d4636) at 20% opacity. If you can see the border clearly, it is too heavy.
*   **Anti-Glassmorphism:** Do not use backdrop blurs. If an element sits on top of another, it must be 100% opaque. We value the "solid state" feel of physical objects.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#e8c357) background with `on-primary` (#3d2f00) text. Sharp `md` (0.375rem) corners. No shadows.
*   **Secondary:** No background. A "Ghost Border" of `outline` (#99907d) at 30% opacity. Text in `primary`.
*   **Tertiary:** Text-only in `on-surface-variant`. Underlined only on hover.

### Cards & Lists
*   **The Rule of Silence:** Forbid all divider lines. 
*   **Separation:** Use the Spacing Scale (specifically 32px or 48px gaps) or a subtle background shift to `surface-container-low`.
*   **Lists:** Leading elements (icons or numbers) should always be in `primary-container` (#b8962e) to act as visual anchors.

### Input Fields
*   **Style:** Minimalist. No background. Only a bottom border of `outline-variant` (#4d4636). 
*   **Focus State:** The bottom border transforms into a 2px `primary` (#e8c357) line. The label should move to `label-sm` in `primary` color.

### Special Component: The "Editorial Block"
A specific layout pattern for this system: A `display-sm` headline on the left, taking up 4 columns of a 12-column grid, with the `body-lg` text taking up 6 columns on the right, leaving the remaining 2 columns as whitespace "breathing room."

---

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Align text to the left but allow large imagery or gold-accented callouts to bleed off the right edge.
*   **Use "Ink-on-Ink":** Nesting a `surface-container-lowest` inside a `surface` to create depth for data tables.
*   **Maximize Whitespace:** If a section feels crowded, double the padding. This is a "Premium" zone; it shouldn't feel like a dashboard.

### Don't:
*   **Don't use Gradients:** Even a 1% gradient ruins the "Solid State" aesthetic.
*   **Don't use Pure White:** Use `on-surface` (#e6e2de) for text. Pure #FFFFFF is too aggressive against the ink background.
*   **Don't use Standard Icons:** If using icons, use thin-stroke (1px or 1.5px) icons. Bold, filled icons will clash with the elegant serif typography.