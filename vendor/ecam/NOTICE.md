# ECAM calculation engine (vendored)

The files in `backend/` and `languages/en.json` are copied **unmodified** from
ECAM v3 — Energy Performance and Carbon Emissions Assessment and Monitoring Tool.

- Source: https://github.com/icra/ecam
- Commit: `3b6aab18fdfe487b71d0f5e414c4806dd11dc647` (2023-03-07)
- Online tool: https://climatesmartwater.org/ecam/
- Developed by ICRA, IWA and GIZ under the WaCCliM project, and Cobalt Water.
- License: Creative Commons Attribution-ShareAlike 4.0 International (see `LICENSE`).

ChatWater Resilience runs these files as-is (in the browser and in a sandboxed
Node `vm` context on the server) so that every emission and energy figure is
produced by ECAM's own published formulas. Do not edit files in this folder;
to update, copy a newer ECAM release over them and run `npm test`.

The Bahasa Indonesia translation in `public/i18n/ecam.id.json` is a derivative
of `languages/en.json` and is shared under the same CC BY-SA 4.0 license.
