# Giftly — Phase 1 MVP Technical Roadmap

**Scope:** Giftly Creator MVP only (link in bio, wishlist, fan markup payments, hidden address architecture).
**Out of scope:** C2C masivo, drops, social feed global, B2B.
**Author audience:** Solo developer using Cursor as AI pair-programmer.

---

## 1. Recommended Tech Stack for Cursor

The stack is chosen for three reasons: (a) maximum velocity for a solo dev, (b) AI assistants like Cursor have huge amounts of training data on it, so suggestions are accurate, and (c) the privacy architecture is enforceable at the database layer (Row Level Security), not just in application code.

| Layer | Choice | Why this and not alternatives |
|---|---|---|
| **Framework** | Next.js 14+ (App Router) + TypeScript | Server Components + Server Actions = the address never has to round-trip to the client. Cursor knows this stack cold. |
| **Styling** | Tailwind CSS + shadcn/ui | shadcn components are copy-pasted into your repo (Cursor edits them like normal code). Avoids opaque component libraries. |
| **Database** | Supabase (Postgres) | Postgres + Row Level Security = privacy enforced at DB layer, not just code. Built-in `pgcrypto` for column encryption. |
| **Auth** | Supabase Auth | Native integration with RLS. Email + magic link + OAuth (Twitch/Google) out of the box, which matches the Creator persona. |
| **Payments** | Stripe (PaymentIntents + Stripe Connect Express) | Connect Express lets you pay creator tips out cleanly with KYC handled by Stripe. PaymentIntents allow application_fee_amount for the platform cut. |
| **File storage** | Supabase Storage | For profile pics and unboxing media. RLS policies apply here too. |
| **Hosting** | Vercel | Edge runtime for public pages, Node runtime for Stripe webhooks (raw body). Zero-config CI from GitHub. |
| **Email** | Resend | Cleanest API, React Email templates. Cursor handles JSX templates well. |
| **SMS / OTP** | Twilio Verify | Phone verification is a trust-points action; Verify abstracts the OTP flow. |
| **Address validation** | Google Address Validation API | Required so a wrong address doesn't surface as a support nightmare. |
| **Forms** | React Hook Form + Zod | Same Zod schemas validate client-side and in Server Actions — single source of truth. |
| **Background jobs** | Supabase Edge Functions / Vercel Cron | For webhook retries, notifications, scheduled tasks. |
| **Observability** | Sentry + Vercel Analytics | Sentry for errors, Vercel for web vitals. Cheap at MVP scale. |
| **Secrets** | Vercel env vars + Supabase Vault | Vault stores the column-encryption keys; never commit anything. |

**Cursor-specific note:** Create a `/.cursorrules` file at the repo root from day 1 (Milestone 0). This file teaches Cursor your conventions (App Router, Server Actions over API routes when possible, Zod everywhere, never log decrypted addresses). Without it, Cursor will mix idioms.

---

## 2. Data Modeling (Database Schema)

### Architectural rule (non-negotiable)

> **Public profile data and private logistics data live in two different tables, with two different RLS policies, and the private table is never queried from a client-context Supabase client. It is only ever queried from a `service_role` server-side context.**

If you only remember one thing from this document, remember that. It's the entire privacy promise.

### 2.1 Tables

#### `creator_profiles` — PUBLIC, readable by anyone

```sql
create table creator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,           -- @handle, used in gift.me/@username
  display_name text not null,
  bio text,
  avatar_url text,
  country_code text,                          -- "ES" — generic, no exact location
  city_generic text,                          -- "Barcelona" — no street
  is_verified boolean default false,
  trust_points integer default 0,
  fan_markup_enabled boolean default false,
  fan_markup_percent numeric(4,2) default 12.00,   -- 10–15
  creator_tip_percent numeric(4,2) default 5.00,   -- 3–8
  stripe_connect_account_id text,             -- Stripe Connect Express account
  stripe_connect_onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table creator_profiles enable row level security;
create policy "Public profiles are readable by anyone"
  on creator_profiles for select using (true);
create policy "Creators can update their own profile"
  on creator_profiles for update using (auth.uid() = id);
```

#### `private_creator_data` — PRIVATE, never read from client

```sql
create extension if not exists pgcrypto;

create table private_creator_data (
  creator_id uuid primary key references auth.users(id) on delete cascade,

  -- These columns are encrypted with pgp_sym_encrypt() using a key from Supabase Vault.
  -- They are stored as bytea, never as plain text.
  legal_name_encrypted    bytea,
  phone_encrypted         bytea,
  address_line1_encrypted bytea,
  address_line2_encrypted bytea,
  address_city_encrypted  bytea,
  address_postal_encrypted bytea,
  address_country_encrypted bytea,

  address_validated boolean default false,    -- Google Address Validation result
  address_validated_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: even the owner cannot read raw encrypted blobs from a client context.
-- All access goes through SECURITY DEFINER functions that run as service_role.
alter table private_creator_data enable row level security;

-- No SELECT policy is created → no client can ever read this table directly.
-- INSERT/UPDATE happen via Server Actions running with the service_role key.
```

#### `wishlist_items` — PUBLIC

```sql
create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  product_url text not null,                 -- Amazon, Shopify, etc.
  product_source text,                       -- 'amazon' | 'shopify' | 'manual'
  product_external_id text,                  -- ASIN or Shopify ID
  title text not null,
  description text,
  image_url text,
  price_cents integer not null,
  currency text default 'EUR',
  priority text default 'normal',            -- 'priority' | 'normal' | 'surprise_me' | 'already_have'
  size_preference text,
  color_preference text,
  is_public boolean default true,
  is_available boolean default true,
  display_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table wishlist_items enable row level security;
create policy "Public wishlist items are readable by anyone"
  on wishlist_items for select using (is_public = true);
create policy "Creators can manage their own wishlist"
  on wishlist_items for all using (auth.uid() = creator_id);
```

#### `gifts` — order record (semi-public to fan, address never exposed)

```sql
create table gifts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  wishlist_item_id uuid references wishlist_items(id),

  -- Fan info: minimal, may be a guest checkout
  fan_email text not null,
  fan_display_name text,
  fan_user_id uuid references auth.users(id),    -- nullable: guest fans allowed
  fan_message text,
  is_anonymous boolean default false,

  -- Money breakdown — every value in cents
  product_price_cents integer not null,
  fan_markup_cents integer default 0,            -- 10–15% on top of product
  platform_fee_cents integer not null,           -- 7% to Giftly
  creator_tip_cents integer default 0,           -- 3–8% to creator (paid via Stripe Connect)
  total_charged_cents integer not null,          -- what the fan actually paid

  -- Stripe references
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_transfer_id text,                       -- transfer to creator for tip

  -- Logistics
  status text not null default 'pending',
  -- pending → paid → ordered_with_supplier → shipped → delivered
  --                                            ↘ failed / refunded
  supplier_order_id text,                        -- e.g. Amazon order ID
  tracking_number text,
  tracking_carrier text,
  -- IMPORTANT: there is NO column here for the shipping address.
  -- The address is read from private_creator_data at the moment of supplier injection.

  unboxing_id uuid,                              -- links back when creator uploads
  created_at timestamptz default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz
);

alter table gifts enable row level security;

-- Fans can read gifts they sent
create policy "Fans see their own sent gifts"
  on gifts for select using (auth.uid() = fan_user_id);

-- Creators can read gifts they received (status only, no fan PII beyond display_name)
create policy "Creators see gifts they received"
  on gifts for select using (auth.uid() = creator_id);
```

> ⚠️ Even though `gifts` has no address column, the **default API representation must explicitly omit `fan_email`** in any response sent to a creator's session, and explicitly omit anything beyond status/tracking in any response sent to a fan's session. See section 3 for how this is enforced with TypeScript DTOs.

#### `unboxings` — PUBLIC by default, creator-controlled

```sql
create table unboxings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  gift_id uuid references gifts(id),
  media_url text not null,                       -- image or short video
  media_type text not null,                      -- 'image' | 'video'
  caption text,
  is_public boolean default true,
  moderation_status text default 'pending',     -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz default now()
);

alter table unboxings enable row level security;
create policy "Public approved unboxings are readable by anyone"
  on unboxings for select using (is_public = true and moderation_status = 'approved');
create policy "Creators manage their own unboxings"
  on unboxings for all using (auth.uid() = creator_id);
```

#### `audit_log_address_access` — for accountability

```sql
create table audit_log_address_access (
  id bigserial primary key,
  creator_id uuid not null,
  accessed_by text not null,                    -- 'webhook:stripe' | 'cron:retry' | etc.
  gift_id uuid,
  reason text not null,                         -- always required
  ip_address text,
  occurred_at timestamptz default now()
);

-- No RLS read policy → only inspectable via service_role. Never exposed to a client.
```

Every single read of `private_creator_data` writes a row here. This is your tripwire: if rows appear with reasons like `'admin_lookup'` or with no `gift_id`, you investigate.

### 2.2 Encryption at rest — what is encrypted

| Field | Encrypted? | Notes |
|---|---|---|
| `private_creator_data.legal_name_encrypted` | ✅ | `pgp_sym_encrypt` with key from Vault |
| `private_creator_data.phone_encrypted` | ✅ | Same |
| `private_creator_data.address_*_encrypted` | ✅ | All address fields |
| `creator_profiles.*` | ❌ | Public by definition |
| `wishlist_items.*` | ❌ | Public by definition |
| `gifts.fan_email` | ⚠️ Hashed for lookup, encrypted column | Use a deterministic hash for lookup + encrypted column for retrieval |
| `gifts.fan_message` | Optional | Low sensitivity, but cheap to encrypt |
| Supabase Storage objects (avatars, unboxings) | ❌ | Public bucket; rely on URL unguessability + RLS on metadata |

The encryption key lives in **Supabase Vault**, not in your `.env`. Your Server Actions call a SECURITY DEFINER Postgres function that decrypts on the database side and returns the cleartext only inside that function's scope.

---

## 3. Critical Flow: Payment & Hidden Address

This is the spine of the whole product. Get this wrong once and the privacy promise is broken forever.

### 3.1 Architectural enforcement (the rules the code must obey)

1. The browser bundle never imports the Supabase `service_role` key. Ever.
2. The fan's session-scoped Supabase client physically cannot SELECT from `private_creator_data` because no RLS policy exists for it.
3. Every API route or Server Action that touches private data is annotated with a comment header `// PRIVACY-CRITICAL` and shows up in a grep audit.
4. All DTOs returned to clients are typed with explicit `Pick<>` types that whitelist fields. There is no `SELECT *` returning to a client.
5. The Stripe webhook is the **only** place where `gifts.status` advances to `ordered_with_supplier`, because that is the only place where the address is read.

### 3.2 Step-by-step flow (text flowchart)

```
[ FAN BROWSER ]
    │
    │ (1) GET /[username]   — public page, RSC fetches creator_profiles + wishlist_items only
    │     Response payload contains: display_name, bio, avatar, wishlist[].
    │     Response payload DOES NOT contain: address, phone, legal_name, fan_email of others.
    ▼
[ FAN BROWSER renders gift.me/@creator ]
    │
    │ (2) Fan clicks "Send gift" on a wishlist item
    │ (3) Server Action: createGiftIntent({ wishlist_item_id, fan_email, fan_message, anonymous })
    │     ↳ runs server-side, creates Stripe PaymentIntent with:
    │         amount        = product + markup  (in cents)
    │         application_fee_amount = platform_fee_cents (7%)
    │         transfer_data.destination = creator's stripe_connect_account_id  (only the ID, NOT the address)
    │         metadata     = { gift_id, creator_id, wishlist_item_id }
    │     ↳ inserts row in `gifts` with status='pending'
    │     ↳ returns ONLY { client_secret, gift_id } to the browser
    │
    │ (4) Browser uses Stripe Elements with client_secret
    ▼
[ STRIPE ] handles card collection (PCI scope = Stripe, not us)
    │
    │ (5) Stripe charges the card → emits webhook `payment_intent.succeeded`
    ▼
[ /api/webhooks/stripe — Node runtime, NEVER edge ]
    │
    │ (6) Verify Stripe signature with STRIPE_WEBHOOK_SECRET. Reject if invalid.
    │ (7) Look up gift by metadata.gift_id. If status != 'pending', idempotent return.
    │ (8) Call get_creator_shipping_address(creator_id, reason='gift_fulfillment', gift_id)
    │     ↳ This is a SECURITY DEFINER Postgres function.
    │     ↳ It decrypts private_creator_data using Vault key.
    │     ↳ It writes a row into audit_log_address_access.
    │     ↳ It returns the cleartext address ONLY in this server function's scope.
    │ (9) Inject the order into the supplier:
    │       — Amazon SP-API CreateOrder(asin, address, quantity)
    │       — or Shopify draft order
    │       — or, in MVP fallback: enqueue an internal "manual fulfillment" task
    │ (10) Update gift: status='ordered_with_supplier', supplier_order_id=...
    │      Discard the cleartext address from memory immediately. Do not log it.
    │ (11) Send email to fan (Resend): "Your gift is on the way"
    │      Send email to creator: "@fan_display sent you a gift!"
    ▼
[ Asynchronous tracking polling — Vercel Cron, every 4h ]
    │
    │ (12) For each gift in 'ordered_with_supplier': poll supplier API for tracking number.
    │ (13) When tracking_number arrives, update gift, notify fan with TRACKING NUMBER ONLY (not address).
    │ (14) When status='delivered': prompt creator (push/email) to upload unboxing.
    ▼
[ Creator uploads unboxing → unboxings table → optional notify fan ]
```

### 3.3 What goes back to the fan's browser, ever

The fan's client will receive — across the whole lifecycle — only these fields about a gift:

```ts
type GiftPublicView = {
  id: string;
  creator_username: string;
  creator_display_name: string;
  creator_avatar_url: string | null;
  product_title: string;
  product_image_url: string | null;
  product_price_cents: number;
  fan_markup_cents: number;
  total_charged_cents: number;
  status: 'pending' | 'paid' | 'ordered_with_supplier' | 'shipped' | 'delivered' | 'failed' | 'refunded';
  tracking_number: string | null;
  tracking_carrier: string | null;
  estimated_delivery_at: string | null;
  created_at: string;
};
// NOTE: no address fields, no phone, no legal name.
```

This type lives in `lib/dto/gift-public.ts`. **Any function that returns data to a fan is typed to return `GiftPublicView` (or a list of them) — never the raw `Gift` row.** TypeScript becomes the second line of defense after RLS.

### 3.4 What goes back to the creator's browser, ever

```ts
type GiftCreatorView = GiftPublicView & {
  fan_display_name: string | null;          // null if anonymous
  fan_message: string | null;
  is_anonymous: boolean;
  creator_tip_cents: number;
};
// NOTE: still no address (the creator already knows their own address — we don't echo it back).
// NOTE: fan_email is NEVER exposed to the creator without explicit consent.
```

### 3.5 Concrete code patterns to enforce this

- **Server Actions for all reads/writes that touch private data.** API routes only for the Stripe webhook (because Stripe needs a stable URL with raw body access).
- **Two Supabase clients in the codebase, never to be confused:**
  - `lib/supabase/server.ts` — `service_role` key. Used only in Server Actions and API routes. Never imported into a `'use client'` file.
  - `lib/supabase/browser.ts` — `anon` key. Safe to ship to the browser. RLS protects everything.
- **A lint rule (or just a `.cursorrules` directive)** that forbids importing `lib/supabase/server.ts` into any file that has `'use client'` at the top.
- **The `get_creator_shipping_address(...)` Postgres function is the only path** to address cleartext. Application code never holds the encryption key.

---

## 4. Master Plan for Cursor (Copy-Paste Prompts)

The milestones are ordered so each one builds on the previous and leaves the app in a deployable state. **Run each prompt in a fresh Cursor Composer session** so the AI doesn't carry state from a stale milestone.

Before Milestone 1, paste this into a file at the repo root called `.cursorrules`:

```
You are working on Giftly, a privacy-first gifting platform. Phase 1 MVP scope = Creator vertical only.

NON-NEGOTIABLE RULES:
1. The recipient's physical address NEVER appears in any payload sent to a client browser.
   The address is read only inside Stripe webhook handlers or server-side cron jobs,
   via the SECURITY DEFINER function get_creator_shipping_address().
2. There are TWO Supabase clients: lib/supabase/server.ts (service_role) and lib/supabase/browser.ts (anon).
   Never import server.ts into a 'use client' file.
3. All database reads that go to a client are typed with explicit Pick<> DTOs in lib/dto/.
   Never return raw row types to a client.
4. Use Server Actions by default. API routes only for: Stripe webhook, OAuth callbacks.
5. Validate all inputs with Zod schemas in lib/schemas/. Same schema validates client and server.
6. Money is always integer cents. Never floats.
7. Every PRIVACY-CRITICAL function gets a header comment "// PRIVACY-CRITICAL" so it can be grep-audited.
8. Tailwind + shadcn/ui for UI. Don't add other UI libraries.
9. Use the App Router, RSC by default, 'use client' only when needed (forms, Stripe Elements, interactivity).

Stack: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + Resend + Twilio Verify.
```

---

### Milestone 0 — Repo & deployment skeleton

**Prompt for Cursor:**
> Initialize a Next.js 14 App Router project with TypeScript, Tailwind, ESLint, and shadcn/ui. Set up the folder structure: `app/`, `components/ui/` (shadcn), `lib/supabase/{server,browser}.ts`, `lib/dto/`, `lib/schemas/`, `lib/stripe/`, `lib/email/`. Create `.env.local.example` with placeholders for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `TWILIO_*`, `GOOGLE_ADDRESS_VALIDATION_API_KEY`. Add a README with the privacy rules from `.cursorrules` reproduced as a "Non-negotiables" section.

---

### Milestone 1 — Supabase schema migration

**Prompt for Cursor:**
> Create a Supabase migration in `supabase/migrations/0001_init.sql` containing every table from section 2 of the roadmap doc: `creator_profiles`, `private_creator_data`, `wishlist_items`, `gifts`, `unboxings`, `audit_log_address_access`. Enable `pgcrypto` and `citext`. Apply the exact RLS policies from the roadmap (no SELECT policy on `private_creator_data`, public SELECT on `creator_profiles` and `wishlist_items`). Add the `get_creator_shipping_address(creator_id uuid, reason text, gift_id uuid)` SECURITY DEFINER function that decrypts the address using `pgp_sym_decrypt` with a key fetched from Supabase Vault (key name `creator_address_key`), writes an `audit_log_address_access` row, and returns a record with the cleartext fields. Also add a `set_creator_shipping_address(...)` SECURITY DEFINER function for writes.

---

### Milestone 2 — Two Supabase clients + auth helpers

**Prompt for Cursor:**
> In `lib/supabase/server.ts`, export a function `createServerClient()` that uses `SUPABASE_SERVICE_ROLE_KEY` and the cookies adapter for App Router. In `lib/supabase/browser.ts`, export a function `createBrowserClient()` that uses the anon key only. Add a top-of-file warning comment in `server.ts` saying "Never import this file from a 'use client' module". Then create `app/(auth)/login/page.tsx` and `app/(auth)/signup/page.tsx` with shadcn forms (email + magic link). Add the auth callback route at `app/auth/callback/route.ts`. Use Supabase Auth helpers, persist session via cookies, and redirect to `/dashboard` after login.

---

### Milestone 3 — Creator onboarding (public profile)

**Prompt for Cursor:**
> Create the onboarding flow at `app/(onboarding)/onboarding/page.tsx`. Step 1: choose a unique `@username` (validate uniqueness against `creator_profiles.username` via Server Action, case-insensitive thanks to citext). Step 2: display name, bio, avatar upload to Supabase Storage bucket `avatars` (public read, owner-only write). Step 3: country and city_generic dropdowns. On completion, insert a row into `creator_profiles` and redirect to `/dashboard`. All inserts via a Server Action in `app/(onboarding)/actions.ts` that validates with a Zod schema in `lib/schemas/onboarding.ts`. Do NOT collect address data here.

---

### Milestone 4 — Private data form (PRIVACY-CRITICAL)

**Prompt for Cursor:**
> Create a settings page at `app/(dashboard)/dashboard/shipping/page.tsx` where the authenticated creator enters legal name, phone, and full shipping address. The form submits to a Server Action `saveShippingAddress` in `app/(dashboard)/dashboard/shipping/actions.ts`. This action: (a) validates input with `lib/schemas/shipping.ts`, (b) calls Google Address Validation API via `lib/address/validate.ts` and rejects unvalidated addresses with a clear error, (c) calls the SECURITY DEFINER function `set_creator_shipping_address(...)` using the `service_role` server client, (d) sets `private_creator_data.address_validated = true`. Mark the action and the validate module with `// PRIVACY-CRITICAL` header comments. The page must NOT pre-fill the form with existing address values — never fetch them back to the client; it just shows "Address on file" when one exists.

---

### Milestone 5 — Wishlist CRUD

**Prompt for Cursor:**
> Build the wishlist management UI at `app/(dashboard)/dashboard/wishlist/page.tsx`. Server Actions in the same route group handle add/edit/remove/reorder of `wishlist_items`. Adding by URL: parse the URL with `lib/products/parse.ts`. For Amazon URLs, extract the ASIN with regex; in MVP fallback, also accept manual entry of title/image/price if parsing fails. Show items as draggable cards (use `@dnd-kit/core` for reordering — update `display_order`). Each card has priority pills ("Priority", "Surprise me", "Already have it"), size/color inputs, and a public/private toggle. Validate everything with `lib/schemas/wishlist.ts`.

---

### Milestone 6 — Public link in bio page (`gift.me/@username`)

**Prompt for Cursor:**
> Create the public route `app/[username]/page.tsx` as a Server Component that fetches `creator_profiles` and public `wishlist_items` using the BROWSER (anon) supabase client — RLS will filter automatically. Render an Instagram-bio-style page: avatar, display name, bio, country/city pill, then wishlist items as a grid. Each item has a "Send as gift" CTA button. Use generous typography, mobile-first Tailwind. Add a `loading.tsx` skeleton and a `not-found.tsx`. Write tests asserting the response payload contains no address/phone/legal_name fields.

---

### Milestone 7 — Stripe Connect onboarding for creators

**Prompt for Cursor:**
> Add a section to `/dashboard/settings` for "Receive tips". When the creator clicks "Set up payouts", call a Server Action `createConnectAccount` that creates a Stripe Connect Express account with `country: 'ES'`, `capabilities: { transfers: { requested: true } }`, persists `stripe_connect_account_id` on `creator_profiles`, then generates an Account Link with `type: 'account_onboarding'` and redirects the creator to it. Add the return route `/dashboard/settings/connect/return` and refresh route `/dashboard/settings/connect/refresh`. On return, retrieve the account, set `stripe_connect_onboarded = true` if `details_submitted && payouts_enabled`. Also add a "Fan markup" toggle that updates `fan_markup_enabled`, `fan_markup_percent` (10-15 range), and `creator_tip_percent` (3-8 range), gated behind onboarded status.

---

### Milestone 8 — Checkout: PaymentIntent creation

**Prompt for Cursor:**
> Create `app/[username]/gift/[wishlistItemId]/page.tsx` as the checkout page. It loads the wishlist item and creator profile (public data only), renders a form for fan email, optional message, anonymous toggle. On submit, call a Server Action `createGiftIntent` in `app/[username]/gift/[wishlistItemId]/actions.ts` that: (1) computes `product_price_cents`, `fan_markup_cents = round(product * fan_markup_percent / 100)` if enabled, `platform_fee_cents = round(product * 0.07)`, `creator_tip_cents = round(product * creator_tip_percent / 100)`, `total_charged_cents = product + markup`; (2) inserts a `gifts` row with `status='pending'`; (3) creates a Stripe PaymentIntent with `amount = total_charged_cents`, `application_fee_amount = platform_fee_cents`, `transfer_data.destination = stripe_connect_account_id`, `metadata = { gift_id, creator_id, wishlist_item_id }`; (4) returns ONLY `{ clientSecret, giftId }`. The browser then renders Stripe Elements and confirms the payment. Tag the action `// PRIVACY-CRITICAL`.

---

### Milestone 9 — Stripe webhook (the heart of the privacy architecture)

**Prompt for Cursor:**
> Create `app/api/webhooks/stripe/route.ts` with `runtime = 'nodejs'` and a POST handler that reads the raw body, verifies the Stripe signature against `STRIPE_WEBHOOK_SECRET`, and dispatches by event type. Handle `payment_intent.succeeded`: load the gift by `metadata.gift_id`, return idempotently if `status !== 'pending'`, then call the Postgres function `get_creator_shipping_address(creator_id, 'gift_fulfillment', gift_id)` via the service_role client to obtain decrypted address, then call `lib/suppliers/dispatch.ts::dispatchGift(gift, address)` (in MVP this enqueues a manual-fulfillment row in a new `manual_fulfillment_queue` table with the address ENCRYPTED again at rest using a per-row symmetric key — do not store cleartext here either). Update gift to `status='ordered_with_supplier'`, `paid_at = now()`. Send Resend emails to fan and creator. Also handle `payment_intent.payment_failed`. Mark the file `// PRIVACY-CRITICAL`. The address variable goes out of scope at the end of the handler — never log it, never store it raw.

---

### Milestone 10 — Manual fulfillment queue (MVP supplier fallback)

**Prompt for Cursor:**
> Add a `manual_fulfillment_queue` table to a new migration `0002_manual_fulfillment.sql` with columns: id, gift_id, encrypted_payload (bytea, contains JSON of { address, product_url, asin, quantity, message }), status ('pending', 'processing', 'fulfilled', 'failed'), supplier_order_id, tracking_number, tracking_carrier, fulfilled_at. RLS: no SELECT policy. Add a SECURITY DEFINER admin function `claim_next_manual_task()` that returns the next pending task to an authenticated admin (check via a new `admin_users` table). Build an internal admin route at `app/admin/fulfillment/page.tsx` (gated by an admin check Server Action) where the human operator: claims a task, sees the decrypted payload ONLY for the duration of that page's render, copies the order details into Amazon manually, then submits the supplier_order_id and tracking back. Log each access in `audit_log_address_access`. This is the MVP shortcut until SP-API automation is built in Phase 1.5.

---

### Milestone 11 — Fan-facing gift status page

**Prompt for Cursor:**
> Create `app/gift/[giftId]/page.tsx` (accessible via a unique link emailed to the fan). It displays: the creator's display name and avatar (from public profile), the product title and image, the fan's message, and the current status with a visual stepper (paid → ordered → shipped → delivered). If `tracking_number` exists, show it with a link to the carrier's tracking page. Define `GiftPublicView` in `lib/dto/gift-public.ts` exactly as in section 3.3 of the roadmap, and write a Server Action `getGiftPublicView(giftId)` that returns ONLY this DTO. Write a Vitest test `__tests__/gift-public-view.test.ts` that asserts the returned object has no keys named `address*`, `phone*`, `legal_name*`, or `fan_email`.

---

### Milestone 12 — Creator dashboard (received gifts + unboxing upload)

**Prompt for Cursor:**
> Build `app/(dashboard)/dashboard/gifts/page.tsx` listing all gifts received by the authenticated creator. Use `GiftCreatorView` DTO from `lib/dto/gift-creator.ts` with the exact shape from section 3.4 (fan_display_name nullable when anonymous, no fan_email). Each row shows status, fan_display_name or "Anonymous fan", message, amounts, and an "Upload unboxing" button when status='delivered'. The unboxing upload flow: file input (image up to 10MB or video up to 30s), upload to Supabase Storage `unboxings` bucket, insert `unboxings` row with `moderation_status='pending'`, then call an automatic moderation function `lib/moderation/auto.ts` (stub for MVP — auto-approve images, flag videos for manual review) that updates moderation_status. After upload, send a notification email to the fan with the unboxing.

---

### Milestone 13 — Trust-points basics (Phase 1 minimum)

**Prompt for Cursor:**
> Create `lib/trust/points.ts` with an `awardTrustPoints(userId, action, amount)` function that updates `creator_profiles.trust_points`. Wire it into: signup with verified email (+10), avatar uploaded (+5), first wishlist item added (+5), first gift received (+30). Add the points display to `/dashboard/settings`. We do NOT build the drops system in Phase 1 — only the points accumulator, so we have data when drops launch in Phase 4. Add a Twilio Verify integration in `lib/trust/phone.ts` and a "Verify phone" button on the settings page that awards +20 on success. Store nothing about the phone except the encrypted value via `set_creator_shipping_address` (extend the function to accept a phone-only update).

---

### Milestone 14 — Notifications (email-first)

**Prompt for Cursor:**
> Build `lib/email/templates/` with React Email templates for: `GiftReceived` (to creator), `GiftPaid` (to fan), `GiftShipped` (to fan), `GiftDelivered` (to creator, prompts unboxing), `UnboxingPosted` (to fan). Build `lib/email/send.ts` wrapping Resend with rate limiting and idempotency keys. Wire each event in the appropriate Server Action / webhook handler. None of these emails contain addresses; the creator email about a received gift contains only fan_display_name (or "Anonymous fan"), product, and amount. Push notifications and in-app notifications are deferred to Phase 1.5.

---

### Milestone 15 — Observability, rate limits, deploy

**Prompt for Cursor:**
> Install Sentry for Next.js and configure it for both browser and server. Add `lib/rate-limit.ts` using Upstash Redis (or an in-memory fallback for dev) and apply a rate limit to: signup (3/h per IP), createGiftIntent (10/h per IP and per fan_email), Stripe webhook (1000/min total, with logging only — never reject Stripe). Configure Vercel deployment: add the Stripe webhook URL to Stripe dashboard pointing to `https://<your-domain>/api/webhooks/stripe`, set all env vars, configure the project. Add a `/health` route that returns DB connectivity check (without leaking version info). Set `runtime = 'nodejs'` on the webhook route only; everywhere else use the default. Document in README how to run Stripe CLI locally to forward webhooks.

---

### Milestone 16 — End-to-end smoke test of the privacy promise

**Prompt for Cursor:**
> Write a Playwright e2e test in `e2e/privacy-end-to-end.spec.ts` that: (1) signs up a creator, completes onboarding, sets a known shipping address (e.g. "Calle Privada 123"), adds a wishlist item; (2) opens an incognito context as a fan, navigates to `/[username]`, intercepts every network response and asserts no response body contains the substring "Calle Privada"; (3) goes through checkout with a Stripe test card; (4) intercepts the gift status page response and asserts again the address string never appears. Also write a unit test that greps the production bundle output (`.next/`) for `SUPABASE_SERVICE_ROLE_KEY` and fails the build if found. Add both to the CI pipeline.

---

### What Phase 1 explicitly does NOT include (stop yourself if Cursor suggests them)

- C2C masivo / public discovery of creators beyond the direct link
- Drops, raffles, prize pools
- Global feed of unboxings
- Followers / following system
- Pool-funded group gifts
- B2B dashboard, bulk gifting, recommendation engine
- Native mobile apps (the responsive web app suffices)
- Crypto payments (Stripe + cards only in Phase 1)
- Internal Giftly credit / saldo
- Klarna / BNPL

If Cursor proposes any of these, reject the suggestion and steer back. They are intentionally deferred per the concept document's Phase 1 scope.

---

## Appendix A — File tree at end of Phase 1

```
giftly/
├── .cursorrules
├── .env.local.example
├── README.md
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/signup/page.tsx
│   ├── (onboarding)/onboarding/page.tsx
│   ├── (dashboard)/dashboard/
│   │   ├── page.tsx
│   │   ├── wishlist/{page.tsx, actions.ts}
│   │   ├── gifts/page.tsx
│   │   ├── shipping/{page.tsx, actions.ts}      # PRIVACY-CRITICAL
│   │   └── settings/{page.tsx, actions.ts}
│   ├── [username]/
│   │   ├── page.tsx                              # link in bio
│   │   └── gift/[wishlistItemId]/{page.tsx, actions.ts}
│   ├── gift/[giftId]/page.tsx                    # fan status view
│   ├── admin/fulfillment/page.tsx                # MVP manual ops
│   ├── api/webhooks/stripe/route.ts              # PRIVACY-CRITICAL
│   ├── auth/callback/route.ts
│   └── health/route.ts
├── components/ui/                                # shadcn
├── lib/
│   ├── supabase/{server.ts, browser.ts}
│   ├── stripe/{client.ts, webhook.ts}
│   ├── dto/{gift-public.ts, gift-creator.ts}
│   ├── schemas/{onboarding.ts, shipping.ts, wishlist.ts, gift.ts}
│   ├── address/validate.ts
│   ├── products/parse.ts
│   ├── suppliers/dispatch.ts
│   ├── moderation/auto.ts
│   ├── email/{send.ts, templates/}
│   ├── trust/{points.ts, phone.ts}
│   └── rate-limit.ts
├── supabase/migrations/
│   ├── 0001_init.sql
│   └── 0002_manual_fulfillment.sql
├── e2e/privacy-end-to-end.spec.ts
└── __tests__/                                    # unit + integration
```

## Appendix B — KPIs to instrument from day 1

- Conversion rate `link in bio visit → gift sent`
- Average gift value (target: > €85 to make C2C math work later)
- Incident rate per 100 gifts (target: < 2%)
- Manual fulfillment queue latency (creator-perceived: paid → shipped) — MVP target < 48h
- Address validation rejection rate (alerts a UX problem if > 5%)
- Audit log entries per gift (should be exactly 1 in steady state — anything else is a leak)

---

*End of roadmap. When you finish Milestone 16, you have a deployable, privacy-correct Giftly Creator MVP. Phase 1.5 work — SP-API automation, push notifications, in-app messaging — comes after you have 5–10 paying creators and validated the operations model.*
