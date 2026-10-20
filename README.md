# Power Padel Arena — Karachi (PECHS)

A high-performance, mobile-responsive web application engineered specifically for **Power Padel Arena** in PECHS, Karachi, Pakistan.

---

## 🎾 Business & Brand Details

- **Business Name**: Power Padel Arena
- **Administrative Email**: `thepowerpadel@gmail.com`
- **Location**: PECHS, Karachi, Sindh, Pakistan
- **Google Maps**: [View on Google Maps](https://maps.app.goo.gl/Gw2bwrz2HEGTKco3A?g_st=ic)
- **Instagram**: [@powerpadelarena_pechs](https://www.instagram.com/powerpadelarena_pechs/?hl=en)
- **Facebook**: [Power Padel Arena](https://www.facebook.com/powerpadelarena/)
- **Visual Identity**:
  - Deep Royal / Navy Blue (`#0A2540`)
  - Energy Orange Accents (`#F97316`)
  - Court Green Accents (`#10B981`)
  - Crisp White & Light Slate Backgrounds (`#FFFFFF` / `#F8FAFC`)

---

## 🖼 Official Logo Placement

The application includes an automatic logo loader in [`src/components/common/BrandLogo.tsx`](file:///src/components/common/BrandLogo.tsx):
- Simply place your official logo file as **`public/logo.png`**.
- It will automatically render at crisp retina resolutions on both desktop and mobile headers.
- If the file is not yet placed, the app displays a modern, on-brand sports lockup ("POWER PADEL ARENA - PECHS • KARACHI").

---

## 🚀 Customer Experience (No Account Required)

Customers can reserve courts directly without registration or passwords:
1. **Homepage (`/`)**:
   - Minimal navigation: **Home**, **Book a Court**, **Location & Contact**.
   - Hero section with direct "Book a Court" CTA.
   - Introduction to Power Padel Arena facilities in PECHS.
   - 4-step booking guide.
   - Location, timings (08:00 AM – 01:00 AM), and direct links to Google Maps, Instagram, and Facebook.
2. **Booking Calendar (`/book`)**:
   - Date picker (next 7 days).
   - Real-time court selection (Panoramic Pro, Center Court, Indoor Climate Control).
   - Time-slot availability view (Available, Temporarily Held, Booked).
   - Player name and WhatsApp number input with Pakistani phone format validation.
   - Pre-submission review modal displaying the total court fee and the 50% advance deposit.
3. **Payment & Status Tracker (`/status`)**:
   - Reference code lookup (e.g. `PADEL-PK-2026-8921`).
   - Official receiving accounts:
     - **Meezan Bank Limited**: Account Title, Account Number, and IBAN (with one-click copy buttons).
     - **Easypaisa**: Title & Mobile Number (with one-click copy).
     - **JazzCash**: Title & Mobile Number (with one-click copy).
   - Screenshot upload interface with image preview and transaction reference (TRX ID) capture.
   - Explicit safety reminder: *Uploading a screenshot sends the booking to 'Payment Under Review'. It is evidence for manual verification, not instant proof of payment.*

---

## 🔒 Administrative Portal (`/admin`)

- **Non-Public Route**: The admin interface is **not** displayed in the public header or customer navigation.
- **Authentication Gateway**:
  - Accessible only to authorized management users.
  - Pre-configured identity: **`thepowerpadel@gmail.com`**.
  - Password and role-based permissions are wired for **Supabase Auth** in Phase 7.
  - Zero hardcoded passwords or private keys in client code or environment variables.
  - Includes an Evaluation Mode access button for Phase 1 UI and workflow review.
- **Management Capabilities**:
  - Today's Bookings and KPI Metrics cards.
  - Filterable Payment Review Queue (`Payment Under Review`).
  - Receipt preview modal (screenshot inspector, customer TRX ID, advance expected).
  - One-click **Confirm Booking** and **Reject Payment** (with customizable reasons).
  - **Cancel Booking** and **Manual Booking Modal** (for counter walk-ins or phone bookings).
  - Court inventory and operating schedule settings.
  - WhatsApp Cloud API architecture preview.

---

## 📲 Official WhatsApp Business Platform Cloud API

A dedicated server-side architecture is established in [`src/services/whatsapp/index.ts`](file:///src/services/whatsapp/index.ts):
- Automated first response directing incoming WhatsApp inquiries to the booking portal.
- Payment hold instructions message generator.
- Official booking confirmation notification with Google Maps address.
- Clearly marked as not connected until live Meta Cloud API credentials are provided in Phase 10.
- No unofficial scrapers or automation are used.

---

## 🛠 Local Setup Instructions

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (copy safe template)
cp .env.example .env.local

# 3. Start local development server
npm run dev

# 4. Verify TypeScript, Linting, and Production Build
npx tsc --noEmit
npm run lint
npm run build
```
Open [http://localhost:3000](http://localhost:3000) for the public website or [http://localhost:3000/admin](http://localhost:3000/admin) for the management desk.
