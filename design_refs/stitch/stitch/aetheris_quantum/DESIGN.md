# Design System Documentation: Tactical High-Precision Intelligence

## 1. Overview & Creative North Star
### The Creative North Star: "The Quantum Lens"
This design system is not a collection of components; it is a high-fidelity environment. We are moving away from the "flat web" into a space defined by **The Quantum Lens**—a philosophy where UI elements feel like precision-machined glass suspended in a deep-space vacuum. 

To achieve this, we reject the rigid, boxy layouts of the last decade. Instead, we utilize **intentional asymmetry**, **dynamic glow states**, and **chromatic depth**. We want the user to feel as if they are interacting with an advanced intelligence that is both powerful and ethereal. We break the "template" look by layering surfaces with varying opacities and using typography that bridges the gap between editorial prestige and technical data.

---

## 2. Colors
Our palette is rooted in the void of `background` (#0b0e17), using light and translucency to define space rather than lines.

### The "No-Line" Rule
**Explicit Instruction:** You are prohibited from using 1px solid borders to section off parts of the layout. In this system, boundaries are invisible. They are defined by:
1.  **Tonal Shifts:** Placing a `surface-container-high` card against a `surface-container-low` background.
2.  **Negative Space:** Using the 16px grid to create distinct islands of information.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted glass sheets.
*   **Base Layer:** `surface` (#0b0e17) – The infinite foundation.
*   **Secondary Layer:** `surface-container-low` (#10131d) – Used for large sidebar areas or background sectioning.
*   **Floating Layer:** `surface-container-highest` (#212533) – For interactive cards and modals.
*   **The Glass Rule:** For premium floating elements, use a semi-transparent version of your surface tokens with a **24px backdrop-blur**. This allows the "Deep Space" background to bleed through, softening the interface.

### Signature Textures
Use **Conic Gradients** (transitioning from `primary` to `secondary`) specifically for Hero components or "Premium" states. This creates a "shimmer" effect that signals high-value data or actions.

---

## 3. Typography
We utilize a triad of typefaces to communicate different tiers of information intelligence.

*   **Display & Headline (Space Grotesk):** This is our "Editorial" voice. It is geometric and futuristic. Use `display-lg` to `headline-sm` for hero moments and section titles. The exaggerated ink traps in Space Grotesk provide the high-precision feel we require.
*   **Body & UI (Inter):** The "Workhorse." Inter provides maximum readability for functional text. Use `body-md` for general content and `title-sm` for subheaders.
*   **Data & Technical (JetBrains Mono):** This is the "Truth" layer. Use this for hashes, timestamps, currency values, and coordinates. It signals to the user that this specific data is raw, precise, and untampered.

---

## 4. Elevation & Depth
In this system, "Up" is defined by light, not just shadows.

### The Layering Principle
Depth is achieved by stacking. A `surface-container-lowest` card placed on a `surface-container-low` section creates a natural "sunken" or "lifted" effect without the need for heavy aesthetics.

### Ambient Shadows & Glows
*   **Shadows:** When an element must float (like a dropdown or modal), use an ultra-diffused shadow (60px–80px blur) at 8% opacity. The shadow should be tinted with `primary` (#a3a6ff) to mimic ambient light refraction.
*   **The "Ghost Border":** If a container requires a boundary for accessibility, use a 1px border with `outline-variant` at **10-20% opacity**. It should be barely perceptible—a "whisper" of a line.
*   **Active Glows:** Active states for buttons or chips should utilize an outer glow using the `primary_dim` or `secondary_dim` tokens to simulate a powered-on LED.

---

## 5. Components

### Buttons: Kinetic Energy
*   **Primary:** Solid `primary` background with `on_primary` text. Apply a subtle `primary_container` inner-glow.
*   **Premium/Hero:** Use a **Conic Gradient** border (#6366F1 to #00F5A0) with a 24px blur background.
*   **Tertiary:** No background. `primary` text. On hover, a 4% `primary` ghost-fill appears.

### Cards: The Frosted Container
*   **Radius:** Always 20px (scale `xl`).
*   **Material:** `surface-container-highest` at 80% opacity + 24px backdrop blur.
*   **Border:** 1px `rgba(255,255,255,0.08)` (The Ghost Border).
*   **Nesting:** Never use dividers inside cards. Use vertical spacing (16px/24px) or a `surface-variant` background for internal headers.

### Input Fields: Precision Entry
*   **Default:** `surface-container-lowest` background, 20px radius.
*   **Focus State:** The "Ghost Border" increases to 40% opacity, and a subtle `primary` shadow (10px blur) illuminates the field.
*   **Data Labels:** Use `label-sm` in `JetBrains Mono` for all input labels to maintain the "technical instrument" feel.

### Selection Chips: Functional Indicators
*   **Selection:** When active, use `secondary` (#1dfba5) text with a 10% `secondary` background tint. 
*   **Shape:** Full pill radius (`full`).

---

## 6. Do's and Don'ts

### Do
*   **Do** use `JetBrains Mono` for any number that changes dynamically (price, count, time).
*   **Do** allow elements to overlap slightly to create a sense of three-dimensional space.
*   **Do** use `secondary` (Neon Emerald) for "Success" and "Go" actions—it cuts through the dark indigo base with high energy.

### Don't
*   **Don't** use 100% white text (#FFFFFF). Always use `on_surface` (Ice White #e9eaf8) to prevent eye strain against the deep black background.
*   **Don't** use standard "Drop Shadows" (Black, 25% opacity). They feel "dirty" in this system. Use tinted, low-opacity ambient glows instead.
*   **Don't** use solid dividers. If you feel the urge to draw a line, increase the padding or change the background tone instead.

---

**Director's Note:** 
Remember, we are building a cockpit for the year 2030. Every pixel should feel intentional, every glow should feel powered by data, and every layout should breathe. If it looks like a standard dashboard, you haven't pushed the tonal layering far enough. Focus on the glass. Focus on the light.