# Toss Sports — Multitasking E-Commerce Platform
## Complete Project Plan

---

## 1. Overview

Toss Sports needs more than a storefront — it needs an operating platform that combines customer-facing commerce with internal business operations. The platform is mobile-first (not a typical desktop-oriented website) and fully custom-coded for complete control over features and scaling.

**Three layers of the platform:**

| Layer | Purpose |
|---|---|
| Customer layer | Storefront, WhatsApp chatbot, customer leaderboard/loyalty |
| Commerce ops layer | Orders, billing, notifications, sales & finance dashboards |
| Internal ops layer | Employee/salesperson tracking, salary, SOPs, manufacturing tracking |

Toss Sports manufactures/assembles its own sports gear in-house, so the platform also needs to connect manufacturing/inventory data to what's sold on the storefront — this isn't a simple resale catalog.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend (customer) | Next.js (React) PWA, mobile-first | Installable app-like experience, one codebase for web + mobile, SEO-friendly |
| Admin dashboards | React (Next.js), role-protected routes | Separate views for owner/finance/HR/sales roles |
| Backend | Node.js (NestJS) or Django REST/GraphQL API | Scales well, strong auth/RBAC ecosystem |
| Database | PostgreSQL | Relational integrity across orders, employees, salary, inventory |
| Realtime/notifications | Socket.io (WebSockets) + Firebase Cloud Messaging | Order alerts, salesperson pings, leaderboard updates |
| Payments/Billing | Razorpay or Cashfree | UPI/card support, webhook-driven billing, GST-compliant invoicing |
| WhatsApp chatbot | WhatsApp Business API via Gupshup/Interakt/360dialog | Order status, support, catalog browsing |
| Hosting | AWS or DigitalOcean, Dockerized | Predictable scaling, CI/CD-friendly |
| File/media storage | S3-compatible object storage | Product images, invoices, SOP documents |

---

## 3. Module Breakdown

### 3.1 Storefront (Customer-Facing)
- Product catalog with search/filter
- Cart, checkout, order tracking
- Mobile-first responsive design with PWA install prompt
- Customer accounts, order history
- Customer leaderboard (points/rewards for repeat buyers)

### 3.2 Order, Notification & Billing Engine
- Order state machine: placed → confirmed → packed → shipped → delivered
- Automatic notifications (SMS/WhatsApp/email/push) on every state change
- Auto-generated GST-compliant invoices
- Payment reconciliation against orders

### 3.3 Admin — Sales & Finance Dashboards
- Real-time sales analytics: revenue, average order value, top products, channel breakdown
- Finance dashboard: incoming payments, refunds, expenses, P&L snapshot

### 3.4 Employee & Salesperson Management
- Work tracking: check-in/out, task logs, attendance
- Salesperson tracking: visits, calls, conversions (if there's a field sales team)
- Leaderboard: gamified performance ranking
- Salary module: attendance-linked payroll, payslip generation

### 3.5 SOP Module
- Structured, searchable SOP repository per role/department
- Version history and acknowledgment tracking (who's read/confirmed each SOP)

### 3.6 WhatsApp Chatbot
- Order status queries, catalog browsing, support ticket creation
- Optional: place orders directly via chat

### 3.7 Manufacturing Unit Tracking
- Production batch tracking
- Raw material → finished stock linkage
- Inventory sync with storefront listings (so stock reflects real production output)

---

## 4. Build Sequence

Modules are ordered by technical dependency, not by priority — every module matters equally to the client, but some have to exist before others can function.

1. **Foundation** — auth, roles/permissions, database schema for all modules, core API structure
2. **Commerce core** — storefront, catalog, cart, checkout, orders, payments/billing
3. **Notification engine** — sales, order, and employee modules all depend on this
4. **Admin dashboards** — sales + finance (needs order/payment data flowing first)
5. **Employee suite** — tracking, leaderboard, salary (can build in parallel with #2–3)
6. **SOP + manufacturing tracking** — can also run in parallel with #5
7. **WhatsApp chatbot** — layered on top once order/notification APIs are stable
8. **Customer leaderboard** — layered on top of storefront + order data

Modules within the same step can be built concurrently if more than one developer is available.

---

## 5. Open Decisions

- [ ] Payment gateway: Razorpay vs Cashfree
- [ ] WhatsApp Business API provider: Gupshup vs Interakt vs 360dialog
- [ ] Hosting: AWS vs DigitalOcean
- [ ] Whether a native mobile app is needed later, or PWA is sufficient long-term
- [ ] Exact scope of "salesperson tracking" — field sales team size and what data they need to log

---

## 6. Next Steps

1. Confirm Option A vs B with the client (team budget vs staged rollout)
2. Finalize payment gateway and WhatsApp provider
3. Design database schema covering all 8 modules up front (even if built in stages)
4. Kick off Foundation phase (auth, roles, core API)
