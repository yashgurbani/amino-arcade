# Design

## System

AlphaFold 3D Companion uses a restrained scientific product UI. The physical scene is a late-evening seminar-prep workstation: the user is comparing equations, 3D structure, and interpretation under low ambient light, so the app uses a dark neutral surface with high-contrast ink and limited signal colors.

## Color Tokens

- `--bg`: `oklch(0.145 0.018 245)` main background.
- `--panel`: `oklch(0.19 0.018 245)` primary tool surface.
- `--panel-2`: `oklch(0.235 0.02 245)` raised surface.
- `--line`: `oklch(0.34 0.025 245)` borders and grid lines.
- `--ink`: `oklch(0.93 0.01 245)` primary text.
- `--muted`: `oklch(0.72 0.025 245)` secondary text.
- `--faint`: `oklch(0.55 0.03 245)` tertiary text.
- `--accent`: `oklch(0.78 0.12 190)` active state, selected residues, primary actions.
- `--warning`: `oklch(0.82 0.13 80)` violations, risky states, low confidence warnings.
- `--danger`: `oklch(0.69 0.17 25)` invalid input and failed backend states.
- `--success`: `oklch(0.76 0.13 155)` high confidence and healthy backend states.

## Typography

Use `Inter`, `Segoe UI`, `system-ui`, and sans-serif fallback. UI labels use 12-14px, body text uses 14-16px, and product headings stay below 32px. Monospace is reserved for sequences, equations, residue IDs, and numeric readouts.

## Layout

The default screen is an app shell, not a landing page: left concept navigation, central simulation/workbench, right interpretation/results rail on desktop. On smaller screens, navigation becomes horizontal and the interpretation rail stacks below the active scene.

## Components

Tabs, buttons, text areas, sliders, segmented controls, status badges, legends, and example list items share the same 8px radius, clear focus rings, disabled states, and semantic status colors. Cards are used for repeated examples and bounded tools only; sections are otherwise unframed or panel-based.

## Motion

Motion is limited to state changes: active selection, recycling playback, confidence updates, and loading skeletons. Respect `prefers-reduced-motion` by disabling animation loops and using instant state updates.
