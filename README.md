# ReaganXS

**Restorative Encoder Applying Generative AI for Near-Lossless Sequences**

Hybrid edge–cloud video platform: **compress aggressively first, restore selectively**.

> Compress with SVT-AV1 (VP9 fallback) → restore only when it helps perception and size → deliver smaller files without a “crushed” look.

---

## Core principles

| Principle | Meaning |
|-----------|---------|
| **Power & efficiency first** | Encode work is budgeted (timeouts, presets, tier limits). Prefer finishing over perfect full-timeline restore. |
| **Compress first** | Always reduce bitstream size before any generative / enhance path. |
| **Restore selectively** | Full restore when fast and output ≤ original; otherwise **partial frames** (default 2). |
| **Progressive tiering** | Demo → Free → Premium (web) → Desktop (local GPU / full models). |
| **Hybrid routing** | Web: browser + cloud worker. Desktop: local FFmpeg + optional model session; cloud only for auth / license / optional registry. |
| **Community models** | Premium/desktop path for shared weights and contribution (roadmap). |

---

## Product surfaces

### Web — [www.reaganxs.com](https://www.reaganxs.com)

- Next.js app (`apps/web`)
- Upload: **&lt; 200 MB** multipart · **≥ 200 MB** presigned **R2** PUT
- Queue: BullMQ, **concurrency 1** (Hobby-friendly)
- Pipeline: compress → route → full restore (short budget) → **partial frames** fallback
- History: download, savings card, **Resume**, **Retry restore** (if `compressedKey` exists), **Cancel** / **Delete**
- Progress survives tab close via `sessionStorage` + History resume (server keeps working)

### Desktop — Tauri 2 (`apps/desktop`)

- Local GPU / CPU path; compress + selective restore on-device
- Models: **4x BHI**, **RGT-S x4**, **ATD SRx4 Finetune** (and web-family weights where packaged)
- Auth / premium / model registry can still touch backend; media stays local by default
- Build: `pnpm tauri build` → `.dmg` under `src-tauri/target/release/bundle/dmg/`

### Backend — Railway (`backend`)

- Express API, MongoDB jobs, Redis + BullMQ worker
- FFmpeg: SVT-AV1 → VP9, Opus stereo
- Cloudflare **R2**: `uploads/`, `compressed/`, `processed/`, `samples/`, `models/`
- Cleanup: tier-based **processed** expiry · **samples** + **compressed** ≈ **9 h** · uploads removed when the job ends

---

## Tiers (summary)

| Tier | Models (typical) | Notes |
|------|------------------|--------|
| **Demo** | Real Web Photo RGT | Tight limits, short expiry |
| **Free** | Real Web Photo ATD | Larger files, more daily jobs |
| **Premium** | RGT + ATD web | VMAF, longer retention, desktop access flags |
| **Desktop** | 4x-BHI, RGT-S, ATD SRx4 | Local processing; expiry often “keep until managed” |

Exact limits live in `backend/src/config/tiers.ts` (`maxFileSizeMB`, `dailyUploads`, `expiryHours`, etc.).

---

## Model IDs (canonical)

| ID | Display |
|----|---------|
| `rgt-webphoto` | Real Web Photo RGT |
| `atd-webphoto` | Real Web Photo ATD |
| `rgt-s` | RGT-S x4 |
| `atd-srx4` | ATD SRx4 Finetune |
| `4x-bhi` | 4x BHI RealPLKSR |
| `compression-only` | No restore |

Legacy names (**PurePhoto**, **PureScale**) are retired from product UI and shared constants.

---

## Monorepo layout

```text
REAGANXS CORE/
├── apps/
│   ├── web/                 # Next.js — www.reaganxs.com
│   └── desktop/             # Tauri 2 + Vite + Rust
├── backend/                 # Express API + BullMQ worker
├── packages/                # Shared TS packages (if present)
├── shared/                  # Shared config (e.g. model maps)
│   └── config/constant.ts
└── README.md