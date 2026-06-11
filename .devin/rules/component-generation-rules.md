---
trigger: always_on
---

# Component Generation Rules

When generating React components, follow these rules strictly.

## HTML Semantics

- Use <button> for actions. Never <div onClick> or <span onClick>.
- Use <a href="..."> for navigation. Never <span onClick={navigate}>.
- Use <nav>, <main>, <aside>, <header>, <footer> for landmarks.
- Use <h1>-<h6> in correct hierarchical order. Do not skip levels.
- Use <ul>/<ol> with <li> for lists.
- Use <table>, <thead>, <tbody>, <th>, <td> for tabular data.
- Use <form>, <fieldset>, <legend>, <label> for forms.
- Use <dialog> for modal dialogs with its showModal() API.
- Use <details>/<summary> for simple disclosures when appropriate.

## Accessibility

- Every interactive element must have an accessible name
  (visible text, aria-label, or aria-labelledby).
- Every form input must have an associated <label> or aria-label.
- Icon-only buttons: aria-label on button, aria-hidden on icon.
- Decorative images: alt="" or aria-hidden="true".
- Dynamic state: use aria-expanded, aria-selected, aria-checked,
  aria-current, aria-disabled as appropriate.
- Use aria-live="polite" for status messages.
- Use aria-describedby for help text and error messages.

## Keyboard Interaction

- All interactive elements must be keyboard accessible.
- Use focus-visible styles. Never remove outlines without replacement.
- Composite widgets: arrow keys per WAI-ARIA Authoring Practices.
- Modals must trap focus and restore it on close.
- Escape must close overlays.

## Motion

- Respect prefers-reduced-motion. Use motion-safe: or
  motion-reduce: Tailwind variants on transitions involving
  spatial movement (transforms, position changes, scaling).
  Simple color transitions on hover/focus are acceptable
  without motion guards.

## Library Preferences

- For complex patterns (tabs, combobox, dialog, listbox, menu),
  use Headless UI, Radix UI, or React Aria instead of building
  from scratch.
- Use Tailwind CSS for styling.
- Include focus-visible ring styles on all interactive elements.

## Testing

- Query elements using getByRole with accessible name,
  not getByTestId.
