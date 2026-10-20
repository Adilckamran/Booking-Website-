# Padel Court Booking & Management System (Pakistan)

A modern, production-minded web application engineered for padel sports clubs in Pakistan. Built with Next.js (App Router), TypeScript, Tailwind CSS, and Lucide Icons, architected for multi-court scheduling, advance payments (Bank Transfer, Easypaisa, JazzCash), screenshot verification workflows, and future official Meta WhatsApp Cloud API automation.

---

## 🚀 Phase 1 Implementation Status

This repository contains the complete **Phase 1** implementation:
- **Clean Architecture**: Decoupled layers separating types, configuration, demo datasets, reusable UI components, and integration services.
- **Configurable Club Identity**: Configurable placeholders for club name, contact phone, location, bank account (IBAN), Easypaisa, and JazzCash.
- **Customer Pages**:
  - **Home Page (`/`)**: Club showcase, court specifications (Panoramic, Center, Indoor Climate Control), 3-step booking guide, location, opening hours, and direct WhatsApp contact.
  - **Booking Calendar (`/book`)**: Court picker, 7-day date selector, 60-minute time-slot availability grid (Available, Held, Booked), peak/standard rates, player information capture with Pakistani phone validation, and review modal.
  - **Payment & Status Tracker (`/status`)**: Booking lookup by reference code (e.g. `PADEL-PK-2026-8921`), payment account details with one-click copy, screenshot file uploader with preview, transaction reference input, and status timeline (Awaiting Payment, Payment Under Review, Confirmed, Rejected, Expired, Cancelled).
- **Admin Management Desk (`/admin`)**:
  - Metric summary cards (Pending Review, Awaiting Payment, Confirmed Bookings, Cleared Advances).
  - Search and filter toolbar (by status, court, and date).
  - List view and visual calendar view.
  - Payment review queue with receipt modal preview.
  - Interactive Confirm Payment, Reject Payment (with customizable reasons), and Cancel Booking actions.
  - Manual booking modal for walk-in or counter reservations.
  - Court inventory and operating schedule settings tabs.
  - WhatsApp Cloud API architecture preview tab.
- **WhatsApp Cloud API Integration Layer**: Modular message template generators (`src/services/whatsapp/`) ready for official Meta Cloud API credentials in future phases.

---

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router with Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4 (with custom athletic navy & vibrant emerald theme)
- **Icons**: Lucide React
- **Target Backend (Phases 2+)**: Supabase (PostgreSQL, Row Level Security, Private Receipts Storage, Auth)

---

## 📦 Local Setup Instructions

### 1. Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+` or `v11+`

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy the provided `.env.example` template to `.env.local`:
```bash
cp .env.example .env.local
```
*(All variables in `.env.example` are safe placeholders. No real secrets or credentials are included or required for Phase 1 demo mode).*

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Type-Check, Lint, and Build
To verify type integrity, code formatting, and static prerendering:
```bash
# TypeScript type checking
npx tsc --noEmit

# ESLint verification
npm run lint

# Production build
npm run build
```

---

## 🧪 Available Routes

| Route | Description |
| :--- | :--- |
| `/` | Customer landing page, club intro, court specs, opening hours, WhatsApp CTA |
| `/book` | Interactive court reservation, date selection, time slots, review modal |
| `/status` | Self-service booking status tracker, payment account copy, receipt uploader |
| `/admin` | Club management dashboard, review queue, receipt inspector, manual bookings |

---

## ✅ Implemented vs Unimplemented Features

### ✅ Implemented in Phase 1
- [x] Initial project setup (Next.js App Router, TypeScript, Tailwind CSS, Lucide React).
- [x] Shared TypeScript definitions (`Court`, `TimeSlot`, `Booking`, `PaymentSubmission`, `BusinessConfig`).
- [x] Central configuration module (`src/config/clubConfig.ts`) with configurable placeholders.
- [x] Reusable component library (`Header`, `Footer`, `StatusBadge`, `DemoBanner`, `Modal`).
- [x] Customer Home page with responsive hero, facilities, and contact details.
- [x] Customer Booking page with court tabs, date selector, slot status indicators, customer form, and review modal.
- [x] Customer Payment & Status page supporting Bank Transfer, Easypaisa, and JazzCash instructions, transaction reference entry, screenshot upload preview, and status updates.
- [x] Prominent manual review disclaimer: uploading a screenshot enters `Payment Under Review` and does not automatically confirm booking.
- [x] Admin dashboard UI with KPI cards, search, status/court/date filters, list/calendar toggle, receipt preview, Confirm/Reject/Cancel actions, manual walk-in booking modal, and settings tabs.
- [x] Official WhatsApp Cloud API template generators and placeholder dispatcher.
- [x] Safe `.env.example` and strict `.gitignore` preventing secret leakage.
- [x] Zero-warning production build and lint pass (`npm run build`, `npm run lint`).

### ⏳ Unimplemented (Scheduled for Future Phases)
- [ ] **Phase 2**: Supabase project setup, SQL migrations, database connection pooling, and `.env.local` linking.
- [ ] **Phase 3**: Real database tables for courts, operating hours, bookings, temporary holds, payment records, and audit logs.
- [ ] **Phase 4**: Atomic slot reservation (PostgreSQL functions/row-level locking) with server-side double-booking conflict protection.
- [ ] **Phase 5**: Configurable hold timers and background worker / cron for automatic hold expiration.
- [ ] **Phase 6**: Secure private storage bucket for receipts with signed admin-only URLs.
- [ ] **Phase 7**: Real Supabase Auth, role-based access control (RBAC), and server actions for administrative Confirm/Reject.
- [ ] **Phase 8**: Transactional email notifications for managers and players.
- [ ] **Phase 9**: Automated customer status notifications and cancellation handling.
- [ ] **Phase 10**: Live Meta WhatsApp Business Platform Cloud API webhook and template dispatcher.
- [ ] **Phase 11**: End-to-end integration tests, mobile device QA, and production deployment on Vercel.

---

## 🔒 Security Principles Maintained
1. **No Credentials in Frontend**: Client bundles contain zero private API keys, service-role tokens, or passwords.
2. **No Fake Payment Validation**: Screenshots are treated solely as subjective human evidence for manual admin review.
3. **Private Storage Architecture**: Future receipt images are designed for private storage buckets with time-limited signed URLs.
4. **Configurable Placeholders**: No hardcoded real phone numbers, real bank accounts, or real CNICs.
