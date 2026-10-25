# FamX Pay — UPI Payment-Link Creation, Checkout & Gmail Notification Verification

FamX Pay is a seller-oriented INR payment-link generator, customer UPI checkout experience, server-side Gmail IMAP notification matcher, and transaction reconciliation platform for India.

> **Important Truthfulness & Settlement Notice:**
> - FamX Pay is an independent software platform and is **not** affiliated with FamPay/FamApp, NPCI, Google Pay, or PhonePe.
> - Launching a UPI application or returning to the browser is **never** treated as proof of payment.
> - Without a direct bank/acquirer webhook, email notifications matched via Gmail IMAP represent *notification evidence* and route ambiguous cases to manual reconciliation (`/app/reconciliation`).

---

## 1. Architecture Overview

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router v7 + `qrcode` + Lucide icons.
- **Firebase Client (`src/lib/firebase.ts`):** Centralized initialization for project `hiiii-72d78` (Firebase Authentication, Cloud Firestore, and Firebase Realtime Database) with **no manual `.env` file required**.
- **Backend (`server.ts`):** Express + TypeScript (`tsx`) full-stack server providing:
  - Server-side TLS IMAP connection testing and bounded inbox scanning (`imap.gmail.com:993`) via `ImapFlow`.
  - Ephemeral AES-256-GCM encrypted in-memory runtime credential vault (Gmail App Passwords are **never** stored in Firestore, RTDB, localStorage, or disk logs).
  - Authoritative payment order creation, state machine enforcement, integer paise validation, and Firebase Realtime Database live signal publishing (`liveOrders/{orderId}` and `sellerLiveStats/{sellerId}`).
  - Deduplication by SHA-256 `messageIdHash` and UPI/UTR reference, plus fraud-resistant reconciliation for same-amount or missing-reference emails.

---

## 2. Running & Testing Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the automated Vitest unit & domain verification suite
npm test

# 3. Type-check the codebase
npm run lint

# 4. Build production frontend bundle
npm run build

# 5. Start full-stack development server on port 3000
npm run dev
```

---

## 3. Deploying Firebase Security Rules & Indexes

Repository security files:
- `firestore.rules` — Seller-scoped Firestore security rules blocking client-side role elevation and client-side order approval.
- `firestore.indexes.json` — Composite indexes for `paymentOrders`, `transactions`, and `reconciliationCases`.
- `database.rules.json` — Realtime Database rules allowing public read of individual `liveOrders/$orderId` nodes while prohibiting public writes.

To deploy rules to Firebase project `hiiii-72d78`:
```bash
npx firebase-tools login
npx firebase-tools use hiiii-72d78
npx firebase-tools deploy --only firestore:rules,firestore:indexes,database
```

---

## 4. Configuring Gmail IMAP App Passwords

1. Open your Google Account settings at `https://myaccount.google.com/security`.
2. Enable **2-Step Verification**.
3. Navigate to **App passwords** (`https://myaccount.google.com/apppasswords`).
4. Generate a 16-character App Password for `Mail`.
5. In FamX Pay, open `/app/setup` (Step 4) or `/app/gmail`, enter your Gmail address and the 16-character App Password, and click **Test Connection**.
6. Click **Save Configuration** to encrypt the credential in the server runtime vault and enable the background polling worker.
