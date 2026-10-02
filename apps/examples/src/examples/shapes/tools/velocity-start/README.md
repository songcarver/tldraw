---
title: Velocity-seeded stroke start (experiment)
component: ./VelocityStartExample.tsx
priority: 100
keywords: [draw, freehand, pressure, velocity, stroke start, experiment]
---

Compare mouse strokes that start at the pointer's speed with strokes that start at a fixed pressure.

---

With a mouse, a draw stroke starts at a fixed pressure of 0.5 and thins as it speeds up, so strokes that begin mid-movement get a round blob at the start. This example records the pointer's speed at mouse-down and uses it as the start pressure. Each stroke you draw gets a copy to its right that uses today's behaviour, from the same points.
