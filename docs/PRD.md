# Toss Sports — Product Requirements Document

| | |
|---|---|
| **Product** | Toss Sports e-commerce platform + Maze Room operations console |
| **Version** | 1.0 |
| **Date** | 7 August 2026 |
| **Status** | Built; pre-launch. Blocked on client configuration items (§11) |
| **Owner** | TheVincis (build) · Toss Sports (business) |

> **How to read this.** This documents what exists and has been verified, not
> what is planned. Anything not yet built is stated as such in §10 and §11.
> Business targets marked *TBC* were not supplied by the client and must not be
> treated as agreed.

---

## 1. Product summary

Toss Sports handcrafts tennis-ball cricket bats in its own unit in Chennai and
sells primarily through WhatsApp and Instagram. There is no working website —
the domain sits on a GoDaddy parked page.

This product is two things behind one codebase:

1. **A storefront** that turns 29 handmade bats into something browsable and
   buyable, without losing the workshop character that differentiates Toss from
   marketplace resellers.
2. **The Maze Room** — the client's name for the operations console — covering
   catalogue, orders, staff, attendance, payroll, SOPs, finance and leaderboards.

### 1.1 Positioning

Toss makes bats; it does not resell them. Every competitor on Amazon and Flipkart
is a reseller. The entire product is built around making that difference visible:
in-house craft language, customisation, and direct contact with the maker.

---

## 2. Goals

### 2.1 Business goals

| # | Goal | Measure | Target |
|---|---|---|---|
| G1 | Replace the parked domain with a working store | Site live on own domain | *TBC* |
| G2 | Capture sales currently lost to manual WhatsApp handling | Orders placed online vs logged manually | *TBC* |
| G3 | Reduce time spent answering repeat enquiries | Chatbot sessions resolved without WhatsApp hand-off | *TBC* |
| G4 | Give the owner visibility of the business in one place | Maze Room used as the source of truth | Qualitative |
| G5 | Make the brand memorable enough to be shared | Return visits, game plays | *TBC* |

Targets are deliberately blank. They should be set by Toss Sports against real
baseline numbers before launch; inventing them here would be false precision.

### 2.2 Product principles

1. **The shop must never depend on the network being up.** Every remote call
   degrades to bundled data. A backend outage must not stop someone buying a bat.
2. **The database is the security boundary, never the interface.** Hiding a
   screen is convenience; row-level policy is protection.
3. **Play must never cost usability.** Interactive flourishes sit behind the
   content, respect reduced-motion, and can be paused.
4. **The owner should not need a developer** to change a price, a policy or a
   phone number.

---

## 3. Users

| Persona | Who | Needs |
|---|---|---|
| **Gully player** | 16–30, plays tennis-ball cricket weekly, price-sensitive, buys on phone | Know which bat suits their ball and budget without jargon |
| **Gift buyer** | Parent or friend, knows nothing about bats | Guidance, confidence, a safe default |
| **Club / team buyer** | Organiser buying 10–20 bats | Bulk pricing, customisation, a human |
| **Owner** | Toss Sports proprietor | Full visibility; change anything without code |
| **Manager** | Runs day-to-day | Orders, stock, staff, SOPs — but not salaries |
| **Salesperson** | Sells via WhatsApp and in person | Log offline sales, see own targets and tasks |
| **Workshop staff** | Makes the bats | Tasks and workshop procedures only |

---

## 4. Scope

### 4.1 In scope (built)

Storefront · product catalogue · guided bat finder · cart and checkout ·
WhatsApp and online payment paths · retro cricket game with real discount
rewards · contextual chatbot · Maze Room with four roles covering sales,
finance, staff, attendance, payroll, tasks, SOPs and leaderboards.

### 4.2 Explicitly out of scope

| Item | Reason |
|---|---|
| WhatsApp Business API automation | Requires Meta verification, a BSP account and per-conversation fees. Click-to-chat delivers most of the value at zero cost. |
| Automated salary disbursement | Client chose records-only. Payouts need business KYC and a funded account. |
| Multi-language (Tamil) | Offered and declined for v1. |
| Marketplace sync (Amazon/Flipkart) | Not requested. |

---

## 5. Functional requirements — Storefront

### 5.1 Catalogue

| ID | Requirement | Status |
|---|---|---|
| FR-1.1 | Present 29 bats with wood, profile, ball type, weight, height, handle, finish, edge | ✅ |
| FR-1.2 | Filter by profile, wood, ball type and price tier | ✅ |
| FR-1.3 | Search by name and attribute | ✅ |
| FR-1.4 | Products with no price show "price on request" and route to WhatsApp rather than a broken checkout | ✅ |
| FR-1.5 | Render a product image; fall back to generated art where no photograph exists | ✅ (fallback in use for all 29) |
| FR-1.6 | Catalogue is served from the database so the Maze Room is the source of truth | ✅ |

**Catalogue facts:** 29 SKUs · 25 priced · ₹950–₹2,999 · 3 tiers (entry/mid/premium)
· 6 profiles (standard, scoop, flat, big edge, mongoose, multi-blade) · 3 woods
(Sri Lankan, Kashmir Willow, Poplar).

### 5.2 Discovery

| ID | Requirement | Status |
|---|---|---|
| FR-2.1 | Hero carousel: six slides, swipe/arrows/dots, autoplay with pause on interaction | ✅ |
| FR-2.2 | Off-screen slides must be inert so they cannot be tabbed into or scrolled to | ✅ |
| FR-2.3 | "Find My Bat" — four questions producing a ranked shortlist | ✅ |
| FR-2.4 | Navigation spans the full bar with no dead space | ✅ |

### 5.3 Cart and checkout

| ID | Requirement | Status |
|---|---|---|
| FR-3.1 | Persistent cart across sessions | ✅ |
| FR-3.2 | Shipping fee and free-shipping threshold configurable, not hardcoded | ✅ |
| FR-3.3 | Order via WhatsApp with the full basket prewritten | ✅ |
| FR-3.4 | Online payment via Razorpay | ⚠️ Built; needs live key (§11) |
| FR-3.5 | Discount codes validated server-side, never in the browser | ✅ |
| FR-3.6 | Every order recorded to the database without blocking the customer | ✅ |
| FR-3.7 | A network failure must not cost the customer their order | ✅ (fire-and-forget write) |

### 5.4 Gully Cricket

A playable retro cricket game rendered at 180×260 with pixelated scaling, styled
after button-phone games.

| ID | Requirement | Status |
|---|---|---|
| FR-4.1 | 3 overs or 3 wickets; lane selection and timed swing | ✅ |
| FR-4.2 | Fielders positioned at real cricket positions, never on the pitch | ✅ |
| FR-4.3 | Timing windows: perfect = 6, good = 4, then 2/1/dot; miss = bowled | ✅ |
| FR-4.4 | A four hit at a fielder is caught; a six always clears | ✅ |
| FR-4.5 | Reward codes stay hidden until earned, then reveal by decode animation | ✅ |
| FR-4.6 | Rewards are real discounts, applying at checkout | ✅ |
| FR-4.7 | Shared leaderboard | ✅ |

### 5.4a Customer accounts

Added after the original scope, at the client's request. Sign-in is Google
through Supabase Auth — no password to store, and nothing to leak.

The account is a convenience laid over a shop that works without one: anonymous
checkout is untouched, and `#/track` still answers "where is my bat" with no
account at all.

| ID | Requirement | Status |
|---|---|---|
| FR-8.1 | Sign in with Google; no password ever stored | ⚠️ Built; needs the provider enabled (§11 C9) |
| FR-8.2 | A customer reads their own orders and nothing else, enforced by RLS | ✅ |
| FR-8.3 | Reorder — refill the bag from a past order, priced from today's catalogue | ✅ |
| FR-8.4 | Saved name, phone and addresses, prefilled at checkout | ✅ |
| FR-8.5 | Service requests (Bat Doctor, trade-in, wholesale) visible with their quotes | ✅ |
| FR-8.6 | Delivery followed per order, with a link to the courier | ✅ |
| FR-8.7 | Orders placed while signed in are attributed automatically | ✅ |
| FR-8.8 | Past guest orders claimable with order number + phone | ✅ |

**The linking problem.** Checkout has never collected an email and Google gives
no phone, so a new account has nothing to match its history against. Three
mechanisms close it, in descending order of trust: new orders are stamped with
the signed-in user as they are placed; service requests — which *do* carry an
email — link themselves against the verified Google address; and past orders are
claimed by proving one order number against the phone it was placed with, after
which every unclaimed order on that phone follows. An order already claimed can
never be taken by a second claimant.

### 5.5 Chatbot

| ID | Requirement | Status |
|---|---|---|
| FR-5.1 | Accept free text, not only buttons | ✅ |
| FR-5.2 | Match questions against the live catalogue and return product cards | ✅ |
| FR-5.3 | Change its opening based on the current page | ✅ |
| FR-5.4 | Cover: picking a bat · size, weight and care · shipping · bulk and custom | ✅ |
| FR-5.5 | Escalate to WhatsApp with the conversation prewritten | ✅ |
| FR-5.6 | Transactional questions must outrank catalogue keywords | ✅ |
| FR-5.7 | Zero per-message cost; no external AI dependency | ✅ |

### 5.6 Living navbar

Two animated fielders run a catching drill across the full width of the header.

| ID | Requirement | Status |
|---|---|---|
| FR-6.1 | Fully automatic; nothing required of the visitor | ✅ |
| FR-6.2 | Must be structurally incapable of intercepting a nav click | ✅ (`pointer-events:none`, behind links) |
| FR-6.3 | Never overlap the logo or the cart icons | ✅ (positions derived from live layout) |
| FR-6.4 | Pausable, and the choice remembered | ✅ |
| FR-6.5 | Absent under reduced-motion and on mobile | ✅ |

---

## 6. Functional requirements — Maze Room

Separate page, `noindex`, reached from a discreet footer link.

### 6.1 Roles

| Capability | Owner | Manager | Sales | Workshop |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ● | ● | own | own |
| Sales list | all | all | own | — |
| Log an offline sale | ● | ● | ● | — |
| Finance | ● | — | — | — |
| Products | ● | ● | — | — |
| Staff roster (view) | ● | ● | ● | — |
| Staff roster (edit + salaries) | ● | — | — | — |
| Attendance | ● | ● | own | own |
| Payroll | ● | own | own | — |
| Tasks | ● | ● | own | own |
| SOPs | ● | ● | by role | by role |
| Leaderboards | ● | ● | ● | — |
| Settings | ● | ● | — | — |

**Salary privacy is a hard requirement:** a manager sees their own payslip and
nobody else's. Verified at database level, not in the interface.

### 6.2 Sections

| ID | Section | Requirement | Status |
|---|---|---|---|
| FR-7.1 | Dashboard | Revenue, orders, staff, stock alerts, 14-day chart, channel split, top sellers. Non-admins see only their own figures | ✅ |
| FR-7.2 | Sales | All orders; log offline sales by channel (WhatsApp, walk-in, phone, Instagram); attribute to a salesperson; change status | ✅ |
| FR-7.3 | Finance | Revenue, cost of goods, expenses, salaries, net position; expense log | ✅ ⚠️ needs cost prices (§11) |
| FR-7.4 | Products | Edit price, MRP, cost, stock, tier, sort, visibility, images, full spec JSON | ✅ |
| FR-7.5 | Team | Staff roster with roles and pay; attendance marking; payroll generation | ✅ |
| FR-7.6 | Tasks | Assign, prioritise, due dates; staff can advance their own | ✅ |
| FR-7.7 | SOPs | Role-scoped procedures, versioned | ✅ (3 seeded) |
| FR-7.8 | Leaderboards | Employees by sales vs target; customers by spend | ✅ |
| FR-7.9 | Rewards | Manage discount codes and unlock thresholds | ✅ |
| FR-7.10 | Settings | WhatsApp number, shipping, Razorpay key, announcement | ✅ |

### 6.3 Payroll

Records only — **no money movement**. Base salary plus commission computed from
each person's attributed sales; owner approves and marks paid after transferring
funds externally. This was a deliberate client decision to avoid KYC and
compliance burden.

---

## 7. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-1 | Storefront fully functional with no network / no backend | ✅ verified with all remote calls failing |
| NFR-2 | No horizontal overflow at 375px on any route | ✅ |
| NFR-3 | Respect `prefers-reduced-motion` | ✅ |
| NFR-4 | No external JS dependencies on the storefront | ✅ |
| NFR-5 | Header must never leave a gap while scrolling | ✅ |
| NFR-6 | Interactive layers must never block navigation | ✅ |
| NFR-7 | Static hosting; no build step | ✅ |

---

## 8. Architecture

```
Browser (static files, no build step)
├── Storefront  index.html + app.js, products.js, art.js, game.js,
│                store-sync.js, chatbot.js, nav-play.js
└── Maze Room   maze.html + maze.js, maze-ops.js, config.js
                        │
        ┌───────────────┴───────────────┐
   Firebase Auth                   Supabase Postgres
   (identity only)                 (all data + policy)
        └──── ID token accepted as third-party JWT ────┘
```

**Why the split:** Firebase provides identity; Supabase provides data and the
security model. Supabase must be configured to trust Firebase as a third-party
auth provider, otherwise row policies cannot read the Firebase UID and the admin
lock is cosmetic. This is a hard dependency (§11).

### 8.1 Data model

26 tables and 10 views, all with row-level security enabled. (The original
13 covered the core; billing, stock, categories, access control, branches,
analytics, services, play styles and customer accounts each added their own.)

| Table | Holds |
|---|---|
| `products` | Catalogue; queryable columns plus a `data` JSON blob for specs |
| `orders` | Web and offline orders, channel, attribution, totals, status |
| `coupons` | Discount codes — **never publicly readable** |
| `scores` | Game leaderboard |
| `settings` | Store configuration |
| `staff` | People, roles, pay, Firebase UID binding |
| `attendance` · `tasks` · `targets` | Work tracking |
| `payroll` | Payslip records |
| `sops` · `sop_acks` | Procedures and acknowledgement |
| `expenses` | Finance |
| `customer_profiles` | Customer name, phone and saved addresses — own-row access only |
| `customer_stats` (view) | Customer leaderboard, inherits order policy |

Functions: `is_admin`, `my_role`, `my_staff_id`, `has_role`, `claim_staff`,
`claim_reward`, `validate_coupon`.

---

## 9. Security model

| Concern | Control |
|---|---|
| Admin access | Firebase UID must appear in `staff`; policies key off it |
| Salary privacy | Owner-only read; everyone else sees only their own row |
| Order book | Public may insert an order, never read one. A signed-in customer reads only rows carrying their own user id |
| Order ownership | Stamped by a database trigger from the session, never taken from the request body |
| Claiming past orders | Requires a valid order number *and* its phone; an order already claimed cannot be taken by a second claimant |
| Discount codes | Not publicly readable; validated by database function |
| Product/price tampering | Write policies restricted to owner/manager |
| Secrets | Supabase URL, publishable key and Firebase web config are public by design. The Postgres password and `service_role` key must never appear in source. |

### 9.1 Verification performed

Simulated a hostile visitor holding only the publishable key visible in page
source. Fifteen attempts refused: reading staff salaries, payroll, expenses,
attendance, targets, customer list, order book, SOPs and coupon codes; and
escalation attempts to add an admin, mint a coupon, alter prices, rewrite an SOP
and wipe the leaderboard. Confirmed by reading tables back as owner rather than
trusting HTTP status codes.

Role isolation tested by impersonating each role's JWT at database level.

### 9.2 Known limitations

1. **Game scores are not server-verified.** A determined person could call the
   reward function directly. Codes are no longer listed publicly and every code
   is validated server-side for existence, activity and minimum spend, but the
   score itself is trusted. Fix if it ever costs real money: move scoring behind
   an Edge Function.
2. **Coupon codes exist in client source.** DOM-level secrecy, not true secrecy.
3. **Order totals are client-submitted.** Acceptable for a WhatsApp-confirmed
   flow; would need server-side recalculation before unattended card payments.

---

## 10. Current status

| Area | Status |
|---|---|
| Storefront | ✅ Complete |
| Find My Bat | ✅ Complete |
| Gully Cricket + rewards | ✅ Complete |
| Chatbot | ✅ Complete |
| Living navbar | ✅ Complete |
| Maze Room (11 sections, 4 roles) | ✅ Complete |
| Database + security | ✅ Complete and verified |
| Storefront ↔ database wiring | ✅ Complete |
| Customer accounts (orders, reorder, addresses, requests) | ⚠️ Built; awaiting C9 and C10 |
| Product photography | ❌ Not started — client dependency |
| Live payments | ⚠️ Awaiting key |
| Deployment | ❌ Local only, by client instruction |

**Test coverage:** six suites — storefront (offline), game field placement, game
mechanics, public RLS, role isolation, and a no-damage check. Migrations verified
to run twice in any order without changing behaviour or duplicating data.

---

## 11. Open items — client dependencies

These block launch and cannot be resolved from the codebase.

| # | Item | Impact if unresolved | Owner |
|---|---|---|---|
| C1 | Enable Firebase as Third Party Auth in Supabase (project `toss-cb8c0`) | **Maze Room unusable.** Nothing loads or saves | Client |
| C2 | Photograph 29 bats | Biggest conversion lever. Nobody spends ₹2,500 on a bat they haven't seen | Client |
| C3 | Price 4 bats: Varnished Bat, CSL Customized Scoop, JHL Joint Handle, Mongoose Style | 4 of 29 leak to manual enquiry | Client |
| C4 | Cost price per bat | Finance shows turnover, not profit | Client |
| C5 | Razorpay live key | No online payment | Client |
| C6 | Rotate the Postgres password (shared in plaintext during setup) | Credential exposure | Client |
| C7 | Confirm the WhatsApp number (two exist across sources) | Orders may route to the wrong phone | Client |
| C8 | Decide hosting and repoint DNS from the GoDaddy parked page | Site not reachable | Client |
| C9 | Enable Google as an auth provider in Supabase (Client ID + Secret from Google Cloud) and allow-list the deployed origin under Authentication → URL Configuration | **Customer sign-in unusable.** The button returns a 400 | Client |
| C10 | Run `sql/018-customer-accounts.sql` against the database | Account area loads nothing; claiming fails | Client |

C3, C4, C5 and C7 are now editable in the Maze Room and need no developer.

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Launching without photographs | High | High | Treat C2 as a launch gate, not a nice-to-have |
| Discount abuse via unverified scores | Low | Low | Caps are small (₹50/₹100) and minimum-spend gated; move scoring server-side if abused |
| Animated navbar distracts shoppers | Medium | Low | Pausable and remembered; removable in one file |
| Owner is a single point of failure in the Maze Room | Medium | Medium | Add a second owner account before launch |
| Supabase free tier limits | Low | Medium | Volumes are far below thresholds at current scale |

---

## 13. Roadmap

**Phase 1 — Launch readiness (client-blocked)**
C1 · C2 · C3 · C5 · C6 · C7 · C8.

**Phase 2 — Post-launch**
Real order volume flowing into dashboards · second admin account · SEO and
metadata · Instagram catalogue alignment.

**Phase 3 — If the business calls for it**
WhatsApp Business API · server-verified game scores · Tamil language ·
loyalty on top of the customer leaderboard.

---

## Appendix A — Catalogue summary

| | |
|---|---|
| SKUs | 29 |
| Priced | 25 (₹950 – ₹2,999) |
| Unpriced | 4 |
| Tiers | entry · mid · premium |
| Profiles | standard · scoop · flat · big edge · mongoose · multi-blade |
| Woods | Sri Lankan · Kashmir Willow · Poplar |
| Photographs | 0 of 29 |

## Appendix B — Repository

```
index.html          storefront          maze.html           Maze Room
css/styles.css      storefront styles   css/maze.css        admin styles
js/products.js      bundled catalogue   js/maze.js          admin shell + auth
js/art.js           generated bat art   js/maze-ops.js      ops sections
js/app.js           storefront app      js/config.js        shared config
js/store-sync.js    database sync       sql/schema.sql      core schema
js/game.js          Gully Cricket       sql/002-…           operations layer
js/chatbot.js       chatbot             sql/003-…           email→UID binding
js/nav-play.js      living navbar       sql/004-…           role repair
js/services.js      services + track    sql/018-…           customer accounts
js/account.js       customer accounts   sql/SETUP.md        setup guide
```
