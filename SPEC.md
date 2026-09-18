# Sparks — Product & Technical Spec (v0.9.2)

**Project name:** Sparks (internal). **Public domain lean:** winbitcoin.app (also consider winbitcoin.io / bitcoinprize.io).  
**One-liner:** Idle compute → lottery entries → win USDT/BTC. (v1 work type: CPU Monero; platform is work-agnostic.)  
**Tone:** Venmo-simple. Fun, clean, not crypto-nerd.  
**Repo:** GitHub (public). Client + website + docs open source. Anyone can build from source.

---

## 1. Goals

1. One download → run. No accounts, no email, no seed phrases.
2. v1: CPU work via RandomX to a pool (Monero as current example); home UI stays prize/entries-first, not coin-nerd.
3. Entries from verified pool work. Easy to earn a few entries; not billions.
4. Prizes paid in **USDT (TRC20) / BTC** (user preference; USDT default), manually at first.
5. Transparent treasury: one public XMR wallet everyone can check.
6. Referrals that pay when friends win.
7. Tiny, beautiful desktop app for **Windows, Linux, macOS Intel, macOS Apple Silicon**. No phones.

Non-goals (v1): mobile, GPU, multi-work switching in the UI, fully automatic payouts, KYC portal, token, browser extension. Multi-work is a later platform layer (see §1A).

---


## 1A. Platform vision (beyond v1 mining)

**Core loop (stable forever):**
`verified useful work on a device` → `entries` → `lottery draws` → `payout in USDT/BTC`.

One consumer machine rarely earns enough cash by itself. Bundled into a lottery, the same electricity can buy a shot at prizes people actually care about. Mining is one work type; the product is the **entries + prizes** layer.

### Work types (same ledger, different verifiers)

| Work type | Hardware | What you verify | Notes |
|-----------|----------|-----------------|-------|
| **XMR (RandomX) pool** | CPU | Pool accepted shares | v1. Steady treasury inflow. |
| **Other mineable coins** | CPU/GPU | Pool/API or own pool | Only if payout → your treasury is clean and legal. |
| **Bitcoin puzzle search** | GPU (mostly) | Distinguished points / assigned ranges | Jackpot-shaped; custody design matters (#140-style better than #71). |
| **AI inference / rented compute** | GPU/CPU | Provider jobs completed + paid | Potentially better unit economics than mining if you get paid for useful work. |
| **Other** (folding, render, bandwidth, …) | varies | Provider attestation | Add only when verification is cheap and hard to fake. |

### Shared product (don’t rebuild)

- Device id, no-login identity
- Entries ledger + referrals
- Operator draws, veto, winner stream, countdown, spinner
- Payout addresses (USDT/BTC)
- Public site / trust surfaces
- Signed remote **work config** (which work type + endpoints)

### Per-work plugin surface

Each work type is a **WorkProvider**:
1. How the client runs the job (binary/config)
2. How the backend **attests** work → entries (never trust the client alone)
3. How revenue (if any) lands in treasury
4. Hardware fit + throttle rules (CPU idle vs GPU)

### Sequencing

1. **v1:** one work type with rock-solid attestation (existing XMR pool).
2. **v1.x:** swappable pool / own pool (already planned).
3. **Later:** add providers behind the same entries/prize UX. User still sees “earning entries,” not five crypto dashboards.

### Product rule

Market the lottery and prizes. Work types are plumbing. Switching or mixing work types must not change the home screen story.

## 2. Product principles

- **Prize-first UI.** Home says “entries,” “idle,” “next award.” Not hashrate, difficulty, or stratum. About/FAQ may name the current work (e.g. Monero) as an example without forever lock-in.
- **Cash feeling.** Prizes shown in $ (and crypto amount). USDT as default mental model.
- **Trust by openness.** Open source client, public wallet, public draw math, public winner list.
- **Yield the machine fast.** When the user comes back, switch to the in-use CPU % (default 0% = stop).
- **Honest lottery.** Most people won’t win. Never market as “earn income.”
- **Period wipe.** After each award event, entries clear so people keep running for the next drop — not a forever pile.

---

## 3. User experience (desktop app)

### 3.1 First launch
1. Generate a local **device id** (UUID, stored on disk).
2. Optional: paste a **referral code** (or open via `sparks://r/<code>` / https install link with `?ref=`).
3. Land on Home.

### 3.2 Home (primary screen)
Minimal:
- Obvious **status pill**: **Earning entries…** (animated) / **Waiting until idle** / **Paused** / **Off** — prize/entries language only (no hashrate, pool, or miner jargon)
- **Your entries** (this period + lifetime stats)
- **Prize pot** (USD estimate + “view wallet”)
- **Next award** (countdown + prize summary)
- Primary button: **Start** / **Pause**
- Quiet footer: invite link · settings · about

No charts. No logs by default. Advanced log behind a hidden “Details / log” disclosure.

### 3.3 Payout addresses
Single screen: **Where should winnings go?**

| Field | Notes |
|--------|--------|
| USDT address | **TRC20 only** in v1 UI (default / recommended) |
| BTC address | Legacy / BIP84 compatible validation |

- **No XMR address** in the user-facing payout UI or save payload.
- **Preferred payout** radio: **USDT** (default) | **BTC**.
- Rules shown plainly:
  - **No per-asset payout minimum** for BTC/USDT (BTC fees are low enough for v1).
  - **Prize amounts** themselves have a floor (target **~$10** smallest prize) so fees stay sane vs winnings.
  - User can prefer BTC even on small wins; operator sends manually.
- **Validate on blur**: checksum/format only (no chain broadcast). Green check / red fix message.
- Addresses stored locally and synced to backend keyed by device id (so draws can pay the right person).

No login. Changing addresses is allowed anytime before a win is locked for payout.

### 3.4 Settings (few)
1. **While I’m using the computer:** CPU % for earning — **0% / 25% / 50% / 75% / 100%**. Default **0%** (idle-only; yield the machine). 0% means pause the worker while in use.
2. **When idle:** separate CPU % — **25% / 50% / 75% / 100%**. Default **50%**. Applied on **Start**, and again when idle after activity.
3. **Consider idle after:** **1 / 5 / 10 / 30** minutes (default **5**). Best-effort activity heuristic until full OS idle APIs land.
4. **If earning pauses while I’m using the computer:**
   - “Stay paused until I press Start” (default)
   - “Automatically resume idle earning”
5. **On battery:** **Off by default**. Optional: “Allow earning on battery.”
6. **Bonus goes to (referral code):** editable anytime before a win is locked — who gets the **10% bonus if this device wins** (not a locked forever install code). Invite/copy lives on Home.
7. **API base URL:** testing/dev only — under a collapsed **Advanced / Developer** disclosure (default `http://127.0.0.1:8787`). Hidden from normal Settings.
8. **Launch at login** (OS optional checkbox; later).
9. Optional **Details / log** disclosure for device id / debug — not the referral UX.

### 3.5 Idle & responsiveness (hard requirements)
- Dual CPU model: switch between **in-use %** and **idle %**. If in-use is **0%**, stop/don’t run the worker until idle (or until Start, per preference).
- **v1 shipping:** persist both percentages; **Start applies idle %**. Best-effort activity heuristic (e.g. input in the app window) switches modes; full OS idle APIs (Windows last-input, macOS idle time, Linux IdleHint / X11/Wayland) are next.
- On user activity with in-use 0%: stop worker ASAP. Target: UI thread never blocked; work in subprocess.
- Architecture: **supervisor UI** + **worker child process** (work-config / pool plumbing under the hood). Kill/pause child on activity. Also stop/pause when on battery unless user opted in.
- User-visible copy: prize/entries/idle only — no RandomX, stratum, pool, or miner jargon on Home/Settings.

### 3.6 Invite friends
- Each device has its own `ref_code` (short, human, e.g. 8 chars) shown on Home for sharing.
- Link: `https://<site>/r/<ref_code>` → download page with ref baked in.
- Settings field **“Bonus goes to (referral code)”** sets/changes `referred_by` anytime before a win is locked (not a one-shot install lock).
- If a referred device wins, referrer gets **+10% of that prize** as an extra payout (winner still gets 100%). Example: $1,000 win → winner $1,000, referrer $100, both from treasury.
- Multi-device self-referral is allowed (accepted).
- Reinstall creates a **new** `device_id` (new competitor). Same payout address across devices/reinstalls is normal and fine — many users will point several machines at one USDT/BTC address.

---

## 4. Entries (ticket economy)

### 4.1 What earns an entry (work-agnostic)
Users earn **entries**. Work providers earn **attested credits**. Those are different layers on purpose.

```
WorkProvider (XMR pool, later AI jobs, puzzles, …)
    → attested native work (shares, jobs, DPs, …)
    → spark_credits   (backend conversion table)
    → entries         (floor(spark_credits / CREDITS_PER_ENTRY))
```

- **v1 provider:** XMR pool accepted work for `worker=device_id` (difficulty-weighted / estimated hashes — not raw share count).
- Later providers plug in the same way: native attestation → `spark_credits` via a versioned rate row.
- Client never self-reports entries. Backend mints credits only from attestation.

### 4.2 Scale + stable entry rate when work type changes
Target feel: a normal laptop at 50% CPU earns **~5–50 entries/day** (aim **10–20** median), not millions.

**Decouple lottery pace from spot revenue:**
- Treasury cares how many $ a provider actually yields.
- The ticket economy cares that a typical machine still earns ~the same entries/day when you switch providers.
- Operator maintains a **conversion table** per provider, e.g. `spark_credits = attested_native * multiplier[provider, version]`.
- When swapping XMR → another CPU/GPU job (or changing mix), **retune multipliers** so the reference laptop stays in band. Do **not** let “$ per hash this hour” directly set entries, or ticket rates will thrash with coin price / job pay.

**Knobs (backend, versioned):**
- `CREDITS_PER_ENTRY` — global, change rarely.
- `multiplier[provider]` — adjust when enabling/switching work; publish `rates_version`.
- Optional soft cap per device/day to stop outliers skewing the pool.

Fairness page copy: “1 entry ≈ a fixed amount of verified Spark credits; what your computer does may change, the credit target for a normal machine stays steady.”

Publish high-level formula; keep exact multipliers operator-tunable without an app update (signed work config + rates).

### 4.3 Period bank (simple wipe)
- Each device has a **current period** entry bank: work **since the last wipe** (one open period at a time).
- App/site show **Your entries (this period)** and optional **Lifetime earned** (stats only — lifetime never enters the draw).
- **One pool, many prizes:** a single award event can pay **multiple prizes** (tiers × quantities) drawn from that same period bank without wiping between individual winners inside the event. v1 may often be **one prize**; console still supports up to 10 lines.
- **Full wipe after every award event:** once that event is finalized, **every device’s period bank clears to 0**. Daily and weekly (or any other scheduled events) are **separate races**, not “earn all week toward Friday while dailies nibble.” After Monday’s daily drop, Friday’s weekly starts from an empty bank.
- Operator reviews eligible device/entry counts by eye when setting prize counts — **no automated seat-fill/void logic required** in v1.
- Rationale: clearing after each award keeps engagement tied to the next countdown.

### 4.4 Fairness
- Only **accepted** work counts.
- Within one award event, draw winners **without replacement on device** for that event (default **one prize per device per event**).
- After the full event completes → wipe all period entries (winners and non-winners).
- Reject duplicate workers / obvious sybil later if needed; v1 allows many devices.
- Missing/invalid payout address: still eligible to win; operator handles payout ops manually (may nudge, delay, or roll value into a later scheduled event). No automated hold/expire workflow required in v1.

---

## 5. Website (public)

Venmo-clean marketing + live stats. Not a block explorer.

### 5.1 Pages
1. **Home** — live devices, big Download buttons, one sentence how it works, **Next award** card, live **Winner stream**, and a compact **Announcements** strip (or link). Avoid implying a single fixed “lottery jackpot reserve.”
2. **Winners** — full history (paginated). Click through from the home stream (“See all”).
3. **Wallet / funding** — public receiving address(es) for current work (v1 may show the XMR treasury as an *example* of where compute value lands). Copy should stay work-agnostic: prizes are funded from compute proceeds / operator funding over time, not a classic ticket-sale pot. Link to explorer(s) when relevant.
4. **Download** — Windows / Linux / macOS Intel / macOS Apple Silicon; checksums; link to source.
5. **Fairness** — entries → credits, how winners are chosen, **period wipe after every award**, daily vs weekly as separate races, veto/re-roll policy, how to verify a draw.
6. **Announcements** — operator-posted notes (home teaser + `/announcements` history). Used for schedule changes, “we’re bumping tomorrow’s prizes,” work-type changes, maintenance. Plain language; newest first.
7. **About / FAQ** — what the app does in simple terms; electricity cost; not income. May use Monero mining as a **current example** of how computers help fund prizes, without locking the product story to Monero forever.
8. **Referral landing** `/r/<code>` — same download, ref attributed.

### 5.2 Home stats (always visible)
- Total prize amount given away (USD + crypto)
- Optional “funding snapshot” only if useful later — **not** a required public prize-reserve / solvency meter (compute value and prize funding are fuzzier than a flat-ticket lottery)
- Total entries (current period pool)
- Active devices (seen in last 15–60 min)
- **Next award** card — schedule summary + countdown (see 5.4)
- **Announcements** teaser (latest 1–2 headlines)

### 5.3 Winner stream (home)
Live-feeling feed (newest first), each row:
- Relative time + absolute date/time
- Prize amount (USD + asset)
- Winner address (truncated with copy; link to explorer when paid)
- Optional “via friend” mark if referral bonus also paid

Click **See all winners** → full history page (filters: date, asset). Re-rolls show as voided proposal + new winner, for trust.

Copy vibe: friendly, short, emoji OK on win toasts. No “hashrate,” “stratum,” “RandomX” on the home page (OK in FAQ footer).

### 5.4 Next award countdown (engagement lever)
Home shows the **next scheduled award event**:
- **Headline** — e.g. “Friday prizes” / “Daily drop”
- **Prize summary** — readable list (e.g. “1× $100” or “1× $100 · 5× $20 · 20× $10”) and **total $** at stake
- **Countdown** to award time (`next_award_at`)
- **Wipe callout (required copy):** entries are for *this* event only; after winners are published, **everyone’s entries reset**. The next daily/weekly event is a **new race** from zero — say this on Home and Fairness, not only in fine print.

Purpose: push people to run before the next drop. Cadence starts **weekly** (often a single prize at first); later **daily** lesser batches plus a **weekly** bigger batch as separate scheduled events.

When countdown hits zero → **Reveal mode** (5.5).

### 5.5 Prize reveal (award events)
An award event can include **many prizes** from one entry pool. Reveal UX:

1. Countdown ends → hero enters **Reveal mode**.
2. For featured / weekly big batches: spinner (or sequential spins) through masked addresses, landing on each winner; show “Prize 3 of 26” style progress.
3. For small daily batches: faster list reveal is OK (stream populates quickly); spinner optional.
4. After the full batch is published → public copy that **entries reset for everyone**; next countdown (if scheduled) is a fresh race. Operator may also post an **Announcement** (e.g. bumping the next event’s prizes).

v1: driven by operator arm/roll (or auto-roll at `next_award_at`). Animation is cosmetic; winners come from published RNG. Fairness page states that plainly.

---

## 6. Pool & treasury

### 6.1 v1: existing pool (how money moves)

**v1 pool: Nanopool** (XMR). Failover pool URL stays in signed remote config (e.g. SupportXMR / HashVault) without an app release.

```
User app  --stratum-->  Nanopool  --payout-->  Your treasury XMR address
                worker = device_id
Sparks backend  --Nanopool API-->  per-worker work  -->  spark_credits  -->  entries
```

1. App starts miner with config roughly:
   - **Pool host** (stratum URL)
   - **Wallet** = Sparks treasury XMR address (same for every user)
   - **Worker name** = `device_id` (so the pool tracks who did the work)
   - **Password / rigid** = per-device secret from Sparks backend (see abuse notes)
2. Users never see or hold XMR. Pool pays **you** on its normal schedule when the account hits threshold.
3. Backend polls the pool’s API (`worker` stats) and mints entries from **accepted** work only.
4. You spend from the treasury for prizes + ops (manual v1).

**Switching pools (required):** do **not** hardcode the only pool into releases.
- Backend serves a signed **miner config** (`pool_url`, wallet, extras, `config_version`).
- App refreshes config on launch / every N minutes.
- If a pool dies or cheats, you point config at another pool (same treasury wallet) or later your own pool. No app store update required.
- Keep a manual override in operator console: “active pool profile.”

**Own pool later:** same wallet + worker scheme; backend reads your pool’s DB/API instead of a third party.

### 6.2 Later: own pool
Optional when scale justifies it (cleaner attribution, less API dependency).

### 6.3 Funding (not a single public “pot”)
- v1 may receive XMR (or other) from the active work provider into operator-controlled wallets.
- Public site can show current receiving address(es) for transparency when useful — without promising one fixed prize reserve.
- Prize funding is **operator-managed** across whatever assets compute currently yields (crypto and/or USD). Convert/send manually for v1 payouts.
- Internal bookkeeping for ops vs prizes is optional; not a product surface.

### 6.4 Operator award console (v1)
Admin-only backend UI (not public). Core object = **award event** (one shared entry pool → many prizes → then wipe).

#### Auth
- Simple **username/password** login (no SSO required for v1).
- Support a **small set of accounts** (e.g. 2) so there is a backup operator login.
- Session cookie / basic auth to the admin UI; not exposed on the public site.

#### Schedule & current view
- **Current scheduled award(s)** — list what’s armed: time, headline, prize lines, total $, status (`draft` / `scheduled` / `armed` / `rolled` / `published` / `paid`).
- **Next award time** — set/edit `next_award_at` (drives public countdown).
- Start cadence: **weekly**. Later: **daily** lesser events + **weekly** bigger event (separate scheduled rows).

#### Build a prize batch (before submit)
Operator configures **up to 10 prize lines** (v1 often **one line / one prize**; multi comes when ready). Each line:
- **Amount** (USD mental model; payout asset follows winner preference unless event locks an asset)
- **Quantity** (how many winners get that amount)

UI must show **live totals before submit**:
- Total prizes (sum of quantities)
- Total payout $ (Σ amount × quantity)
- Estimated referral float (+10% on each win)
- Grand total if all pay

Also show **current eligible devices / total period entries** as readouts for the operator to judge by eye — no auto-block if seats &gt; devices.

Example: `1 × $100` early on; later `1 × $100` + `5 × $20` + `20 × $10` → 26 prizes, $500 (+ referral extras).

Optional per event: headline, blurb, use home spinner (`true`/`false`).

**No public prize-reserve / solvency gate.** Funding may sit across different crypto/USD pots as work types change; this is not a classic fixed-ticket lottery. Operator judgment only.

#### Announcements (operator)
- Create/edit short public announcements (title, body, optional pin-to-home).
- Use for schedule notes, prize bumps on upcoming events, maintenance, work-type changes.

#### Arm / roll / publish
1. **Save schedule** — event appears under “current scheduled prizes” and on the public countdown when it’s the next one.
2. **Entry window** — default: all period-bank entries since last wipe/cutoff at `next_award_at`.
3. **Arm / Roll** — roll now, or auto-roll at countdown zero.
   - Draw **all prizes in the batch from the same snapshot**, weighted by entries.
   - Default: **without replacement on device** (one prize per device per event). Order: typically largest amounts first.
   - Output: ordered winner list (prize line, `device_id`, entries, preferred asset, payout address, referrer).
4. **Review** — full list with copy/export; per-row veto.
5. **Veto / override** — reject a winner for abuse (reason stored); re-roll **that seat** excluding vetoed device(s), or cancel event.
6. **Publish reveal** — push batch to spinner/stream.
7. **Wipe** — on publish (or explicit “finalize”), **clear all period entry banks** to 0. Next period starts.
8. **Mark paid** — paste tx ids per winner (and referral rows).

Abuse veto copy on Fairness page unchanged in spirit: rare, logged as re-rolled (policy), no doxxing.

### 6.5 Manual payouts
- v1 payouts are **manual** on-chain/exchange sends.
- Smallest prizes ≈ **$10**; no separate BTC send-floor while network fees stay low (~$0.25 class).
- Site updates when operator marks paid.

---


## 6A. Abuse & trust (pool-related)

### What is hard to fake
- **Entries** if sourced from pool **accepted shares** for workers on *your* wallet. Client cannot simply POST “I did 1M entries.”

### Real abuse cases
1. **Worker spoofing** — attacker mines to your treasury wallet but sets `worker=victim_device_id` to steal someone’s entry credit (or farm many ids).  
   **Mitigation:** each device gets a **worker password / rigid** from backend at register; pool account must require it. Config signed so casual users don’t run with blank password. Open-source forks can still mine to you under new ids (that’s fine: they earn their own entries by doing real work).
2. **Config hijack** — malware or a malicious build points stratum at attacker wallet.  
   **Mitigation:** official builds fetch **signed** config; show treasury address in About; website publishes expected wallet; optional pin of wallet in binary with override only via signature.
3. **Pool risk** — pool outage, unpaid balance, API lies.  
   **Mitigation:** swappable pool profiles; don’t leave huge unpaid balances; reconcile wallet receipts vs API.
4. **Referral / multi-device gaming** — allowed for self-devices; still costs electricity. Problem only if entries can be faked (they shouldn’t).
5. **Botnets / unpaid power** — people install Sparks on machines they don’t pay for.  
   **Mitigation:** ToS, veto, anomaly detection (too many devices / ASNs), legal takedown. Not fully solvable.
6. **Winner abuse** — stolen addresses, wash patterns.  
   **Mitigation:** operator veto/re-roll (already in spec).
7. **Reveal theater distrust** — users think spinner picks the winner.  
   **Mitigation:** publish RNG first; animation is display-only.

### What you accept
- Anyone can compile a client that only mines and ignores the lottery. Harmless.
- Anyone can mine to your treasury under a new registered device and compete fairly.
- You cannot stop a determined forked binary; you only protect the default path and the entry ledger.


## 7. Winner selection (verifiable)

Goal: public can recompute **all winners in an award event** from published data.

### 7.1 Before award (commit)
At cutoff `T_cut` (= award time):
1. Snapshot period banks: `(device_id, entries, payout prefs)`.
2. Build deterministic ticket commitment (`TICKET_ROOT`).
3. Publish `TICKET_ROOT`, total entries, prize batch (amounts × quantities), cutoff time.

### 7.2 Entropy source
Pick one and stick to it (recommend **drand** or **Bitcoin block hash** after `T_cut`):
- Publish: `seed = SHA256(TICKET_ROOT || public_beacon)`.
- Same seed drives the entire multi-prize draw for that event.

### 7.3 Selection (multi-prize, one pool)
- Weighted draws from the snapshot using `seed` (device with 12 entries = 12 weight).
- Fill prize seats in published order (usually largest amount first).
- Default **without replacement on device** for the event.
- Algorithm in repo (`draw.py`) must reproduce the full winner list.
- Output: winners for each seat + referrer bonus rows.
- **After finalize/publish:** wipe all period banks.

### 7.4 Prize cadence
- **v1 start:** **weekly** award events; often **a single prize** while learning.
- **Soon after:** **daily** lesser events + **weekly** bigger events as **separate schedule rows** — each event wipes; they do not share one week-long entry pile.
- Smallest prize floor ≈ **$10**.
- Home always shows next scheduled event summary + countdown + wipe callout.
- Referral 10% is **extra**, not taken from the winner’s check.
- Publish wins to the stream; note entries reset; use **Announcements** for bumps/schedule notes.

---

## 8. System architecture

```
┌──────────────────────────┐
│ Desktop app (UI)         │
│  device_id, addresses    │
│  idle monitor, settings  │
└───────────┬──────────────┘
            │ spawns/kills
┌───────────▼──────────────┐
│ Worker process           │
│ (RandomX / provider)     │
│  pool + worker=device_id │
└───────────┬──────────────┘
            │ stratum shares
┌───────────▼──────────────┐
│ Public XMR pool          │
│  → pays treasury wallet  │
└───────────┬──────────────┘
            │ pool API stats
┌───────────▼──────────────┐
│ Sparks backend           │
│  devices, entries, draws │
│  referral graph          │
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│ Website + operator tools │
│  stats, fairness, CSV    │
└──────────────────────────┘
```

### 8.1 Client ↔ backend API (no auth passwords)
- `POST /v1/devices/register` — `{device_id, ref_code?, app_version, os}`
- `PUT /v1/devices/{id}/payout` — addresses + preference (signed or HMAC with device key)
- `GET /v1/devices/{id}/summary` — entries, status, next draw
- `GET /v1/public/stats` — pot, entries, devices, next draw
- Device key: created locally at install, public key registered once (simple request signing to prevent easy entry spoofing). v1 can start with soft trust + pool worker as source of truth for work.

**Source of truth for entries = pool accepted work**, not client self-reports.

### 8.2 App distribution
- GitHub Releases: signed binaries + SHA256SUMS.
- Build instructions for each OS.
- macOS Apple Silicon and Intel separate artifacts.
- Windows/macOS: **code signing + notarization** budgeted as a shipping requirement, not a nice-to-have (miner-class binaries trip SmartScreen/Gatekeeper/AV).

### 8.3 Worker process & AV reality (XMR v1)
Architecture stays **supervisor UI + worker child process** (not in-process mining).

**Will a VM/container fix XMRig alerts?** Usually **no** as the primary strategy:
- Docker Desktop / WSL2 / a full VM are heavy for a “one download” consumer app and hurt the Venmo-simple goal.
- Windows Defender and other AV often still scan WSL filesystems, container layers, and the launcher that pulls the miner image. Nested isolation ≠ allowlisted.
- Users blame Sparks when nested tooling breaks (Hyper-V, disk bloat, battery).

**Prefer (in order):**
1. **Don’t ship stock XMRig branding** if possible — pin a RandomX worker you build/reproduce from source (own artifact name, open build scripts). Still may flag as “generic miner”; better than matching known XMRig hashes.
2. **Authenticode (Win) + Apple notarization**; publish checksums and an “Is this safe?” page.
3. **AV vendor allowlist / false-positive submissions** before wide launch.
4. Signed remote **worker module** fetch (versioned) so you can rotate binaries without a full app store cycle — still signed, still attested.
5. **Low-privilege child process** + kill on activity (already required). Optional Job Object / sandbox for crash isolation — not for hiding.

**Optional later (power/advanced users only):** Linux container profile or “run worker in WSL” as an *advanced* setting — never the default path for v1.

Kill-switch / pause via signed config remains mandatory if a build gets burned by AV signatures.

---

## 9. Tech choices (suggested)

| Layer | Choice |
|--------|--------|
| UI | Tauri 2 or lightweight native webview; keep binary small |
| Worker | Prefer own pinned RandomX worker (reproducible build); stratum to Nanopool; subprocess only |
| Pool | **Nanopool** (failover via signed config) |
| USDT | **TRC20** default |
| Hosting | **Google Cloud** (see §9.1) |
| Backend | Cloud Run (Go/Node) + **Cloud SQL Postgres** |
| Site | Firebase Hosting or Cloud Run-served static/Next |
| Admin auth | Simple username/password (2 accounts); can sit in front of admin routes |
| Draw tool | Same draw code in repo; runnable from operator machine or admin UI |
| Rates | Public price API for USD estimates only |

Pin worker version; reproducible builds from source for trust.

### 9.1 Google / Firebase: what to use

Firebase alone is great for the **website** and light glue; the **entries ledger** wants SQL.

| Need | Fit |
|------|-----|
| Public site (Home, Fairness, Announcements, Download) | **Firebase Hosting** ✓ |
| HTTPS, CDN, custom domain later | Firebase Hosting ✓ |
| Device API, credit mint, award events, admin | **Cloud Run** (container) ✓ — prefer over only Cloud Functions if you want a normal long-lived HTTP API |
| Entries / devices / awards / idempotent ingest | **Cloud SQL (Postgres)** ✓ — better than Firestore for weighted draws, snapshots, `TICKET_ROOT` |
| Cron: poll Nanopool workers | Cloud Scheduler → Cloud Run job/endpoint ✓ |
| Secrets (pool wallet is public; admin password, signing keys) | Secret Manager ✓ |
| Operator login | App-level username/password (as spec’d); optional Firebase Auth later — not required for v1 |
| Firestore as primary DB | **Skip for v1 ledger** — possible later for announcements cache only |

**Recommended shape:** Firebase Hosting (site) + Cloud Run (API/admin) + Cloud SQL Postgres + Cloud Scheduler (Nanopool poll). All on the same Google project. That is “hosting on Google” without forcing the lottery math into Firestore documents.

---

## 10. Trust & safety checklist

- [ ] Open source client + draw script
- [ ] Public treasury address
- [ ] Published ticket root + beacon per draw
- [ ] Winner list + payout tx ids
- [ ] Clear “not income / optional / costs electricity” copy
- [ ] Kill-switch: remote config to pause mining network-wide if needed
- [ ] Worker only connects to documented pool/work endpoints
- [ ] Code signing + notarization; public “Is this safe?” / checksums
- [ ] Entry rates versioned; provider multipliers tunable without app release
- [ ] No hidden browser mining, no persistence beyond user settings

---

## 11. Legal / positioning (product copy)

- Market as a **voluntary idle-compute prize game**, not employment or guaranteed returns.
- Electricity is the user’s cost of playing.
- About/FAQ/ToS: describe current work as an **example** (Monero mining OK as v1 illustration); keep room to change work types.
- Geo / age / sweepstakes framing: **deferred** until operator has counsel input — do not block product build on this section.
- Terms stubs: eligibility TBD, referral abuse, manual payout delays, reinstall = new device id.

---

## 12. Milestones

### M0 — Spec lock
This document + name + prize % + CREDITS_PER_ENTRY / multiplier calibration plan.

### M1 — Skeleton
- Device register + public stats API
- Website home + wallet page
- Credit ingestion from Nanopool API (Cloud Scheduler cron)

### M2 — Desktop app
- UI Home / Payout / Settings
- Idle start/stop + CPU %
- **Battery: earn off by default**
- Bundled worker → pool with worker=device_id
- Referral link copy

### M3 — First award events
- Operator console: username/password (2 accounts), prize batch (start with 1 prize; up to 10 lines), totals + eligible device/entry readouts, schedule, roll, veto/re-roll, publish, **wipe**, mark paid, **announcements**
- Ticket snapshot + published seed method
- Home: wipe callout, winner stream, reveal, announcements, winners history

### M4 — Hardening
- Binary signing, better idle on Wayland, anti-spoof HMAC, own pool consideration

---

## 13. Open decisions (need owner pick)

1. Domain purchase: lean **winbitcoin.app** (optional twins winbitcoin.io / bitcoinprize.io).
2. Exact `CREDITS_PER_ENTRY` + v1 Nanopool `multiplier` after a 48h calibration on 5–10 machines.
3. Public wording for veto/re-roll (keep short and plain).
4. Exact weekday/time for weekly award; when to add daily lesser events.
5. Legal/geo/age (deferred).
6. Failover pool profile when needed (SupportXMR or HashVault — not required to launch).

### Settled (v0.9)
- **Public domain lean:** winbitcoin.app.
- **Pool:** Nanopool for v1; signed remote config can point elsewhere later.
- **USDT network:** TRC20 default.
- **Hosting:** Google Cloud — Firebase Hosting for the public site; Cloud Run + Cloud SQL Postgres for API/ledger; Cloud Scheduler for pool polls.
- Project name **Sparks** for now; domain later.
- No BTC payout minimum; smallest **prizes** ≈ $10.
- **Entry rule:** one period bank since last wipe; award events draw from that pool; **every event wipes everyone**. Daily/weekly = **separate races**. Lifetime stats only.
- v1 awards often **one prize**; console still supports up to 10 lines (amount × quantity) with live totals + eligible device/entry readouts (operator judgment, no auto seat logic).
- Default **one prize per device per event**.
- Cadence: start **weekly**; then daily lesser + weekly bigger as separate events.
- Home/Fairness: **wipe callout** required; **Announcements** for bumps/schedule/work notes.
- No public prize-reserve/solvency meter; funding may span multiple assets as work changes (not classic ticket lottery).
- Missing payout address: manual ops (nudge / pay later / bump next events) — no automated expire flow.
- Reinstall = new device id; same payout address across devices is fine.
- **Battery: earning off by default** (opt-in to allow).
- Operator admin: simple **username/password**, a couple backup accounts.
- About/FAQ may use Monero as a **current example**, not a forever lock-in.
- Legal deferred until more info.
- Pool + signed remote work config; `spark_credits` multipliers; signed own worker (not Docker/VM default).
- Platform: **compute → entries → USDT/BTC prizes**.

---

## 14. Success metrics (early)

- Install → Start conversion
- Median entries/device/day in target band (5–50)
- Time-to-pause on user activity (<5s stop)
- Referral attach rate
- Draw verification reproduced by a stranger from docs alone

---

*End of spec v0.9*
