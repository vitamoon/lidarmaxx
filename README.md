# Penumbra

> Real-time 360° spatial alignment for embodied AI.

Penumbra is the missing safety layer for AI systems that move through physical
space. Humans declare inviolable geometric constraints — *the robot does not
enter the nursery, the drone does not cross the property line, the forklift
does not pass within 1.5 m of a person* — and Penumbra continuously verifies
those constraints against a live 360° LiDAR feed at sensor speed, with a
tamper-evident audit log of every decision.

This repo is the runnable reference implementation. It runs entirely in the
browser, with no install step.

**Live demo:** https://vitamoon.github.io/lidarmaxx/

**Project status:** active development. Built for LA Hacks 2026.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical deep dive,
[`docs/ALIGNMENT.md`](docs/ALIGNMENT.md) for the safety thesis, and
[`docs/DEVPOST.md`](docs/DEVPOST.md) for the submission narrative.

## Why this exists

Constitutional AI gives us a way to constrain *what models say*. RLHF shapes
*what they output*. Neither has anything useful to say about *what an embodied
AI does in the room you are standing in*. As robot foundation models leave the
lab and enter homes, warehouses, and roads, the alignment community's
text-centric toolkit stops being sufficient.

Penumbra is one piece of the answer: a real-time, formally-checkable, verifiable
spatial constitution that an embodied agent must respect, enforced at the
sensor layer, independent of the model that's driving the agent.

## Quick start

```bash
git clone https://github.com/vitamoon/lidarmaxx.git
cd lidarmaxx
python -m http.server 8000   # or: npx serve .
# open http://localhost:8000
```

No build step. No `node_modules`. The whole thing is HTML + ES modules + a
single Three.js dependency loaded from CDN via importmap.

## License

MIT. See [`LICENSE`](LICENSE).
