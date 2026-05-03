-- Giftly — Milestone 1 initial schema migration
-- Source of truth: docs/roadmap.md section 2 (Data Modeling).
-- IMPORTANT: This migration is version-controlled. Do NOT hardcode encryption keys here.

-- ============================================================
-- 1) Extensions (required)
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists citext;

-- 2) Encryption key configuration (MANUAL, ONE-TIME, OPERATOR-RUN)
-- The encryption key is stored in Supabase Vault, not in this migration.
-- Run ONCE manually in the Supabase SQL Editor, with the real key, then delete the query:
--   create extension if not exists supabase_vault with schema vault cascade;
--   select vault.create_secret('REAL_KEY_HERE', 'app_encryption_key', 'Giftly creator address encryption key');

-- ============================================================
-- Schemas
-- ============================================================
create schema if not exists private;

-- ============================================================
-- 3) Tables + RLS (exact order from roadmap section 2)
-- ============================================================

-- ------------------------------------------------------------
-- creator_profiles — PUBLIC, readable by anyone
-- ------------------------------------------------------------
create table if not exists public.creator_profiles (
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

alter table public.creator_profiles enable row level security;

drop policy if exists "Public profiles are readable by anyone" on public.creator_profiles;
create policy "Public profiles are readable by anyone"
  on public.creator_profiles for select using (true);

drop policy if exists "Creators can update their own profile" on public.creator_profiles;
create policy "Creators can update their own profile"
  on public.creator_profiles for update using (auth.uid() = id);

drop policy if exists "Creators can insert their own profile" on public.creator_profiles;
create policy "Creators can insert their own profile"
  on public.creator_profiles for insert with check (auth.uid() = id);

-- ------------------------------------------------------------
-- private_creator_data — PRIVATE, never read from client
-- ------------------------------------------------------------
create table if not exists private.private_creator_data (
  creator_id uuid primary key references auth.users(id) on delete cascade,

  -- These columns are encrypted with pgp_sym_encrypt() using a key.
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

alter table private.private_creator_data enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policies are created.
-- Access is only via service_role + SECURITY DEFINER functions.

-- ------------------------------------------------------------
-- wishlist_items — PUBLIC
-- ------------------------------------------------------------
create table if not exists public.wishlist_items (
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

alter table public.wishlist_items enable row level security;

drop policy if exists "Public wishlist items are readable by anyone" on public.wishlist_items;
create policy "Public wishlist items are readable by anyone"
  on public.wishlist_items for select using (is_public = true);

drop policy if exists "Creators can manage their own wishlist" on public.wishlist_items;
create policy "Creators can manage their own wishlist"
  on public.wishlist_items for all
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- ------------------------------------------------------------
-- gifts — order record (semi-public to fan, address never exposed)
-- ------------------------------------------------------------
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  wishlist_item_id uuid references public.wishlist_items(id),

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

alter table public.gifts enable row level security;

drop policy if exists "Fans see their own sent gifts" on public.gifts;
create policy "Fans see their own sent gifts"
  on public.gifts for select using (auth.uid() = fan_user_id);

drop policy if exists "Creators see gifts they received" on public.gifts;
create policy "Creators see gifts they received"
  on public.gifts for select using (auth.uid() = creator_id);

-- ------------------------------------------------------------
-- unboxings — PUBLIC by default, creator-controlled
-- ------------------------------------------------------------
create table if not exists public.unboxings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  gift_id uuid references public.gifts(id),
  media_url text not null,                       -- image or short video
  media_type text not null,                      -- 'image' | 'video'
  caption text,
  is_public boolean default true,
  moderation_status text default 'pending',     -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz default now()
);

alter table public.unboxings enable row level security;

drop policy if exists "Public approved unboxings are readable by anyone" on public.unboxings;
create policy "Public approved unboxings are readable by anyone"
  on public.unboxings for select using (is_public = true and moderation_status = 'approved');

drop policy if exists "Creators manage their own unboxings" on public.unboxings;
create policy "Creators manage their own unboxings"
  on public.unboxings for all
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- ------------------------------------------------------------
-- audit_log_address_access — for accountability
-- ------------------------------------------------------------
create table if not exists public.audit_log_address_access (
  id bigserial primary key,
  creator_id uuid not null,
  accessed_by text not null,                    -- 'webhook:stripe' | 'cron:retry' | etc.
  gift_id uuid,
  reason text not null,                         -- always required
  ip_address text,
  occurred_at timestamptz default now()
);

alter table public.audit_log_address_access enable row level security;
-- No SELECT policy → only inspectable via service_role. Never exposed to a client.

-- ============================================================
-- 4) Function: get_creator_shipping_address(...)
-- ============================================================
-- PRIVACY-CRITICAL
drop function if exists public.get_creator_shipping_address(uuid, text, uuid) cascade;
create or replace function public.get_creator_shipping_address(
  p_creator_id uuid,
  p_reason text,
  p_gift_id uuid,
  p_accessed_by text
)
returns table (
  legal_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  address_city text,
  address_postal text,
  address_country text
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_key text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'p_reason is required';
  end if;

  if p_accessed_by is null or btrim(p_accessed_by) = '' then
    raise exception 'p_accessed_by is required';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'app_encryption_key';

  if v_key is null then
    raise exception 'encryption key not configured in vault';
  end if;

  insert into public.audit_log_address_access (creator_id, accessed_by, gift_id, reason)
  values (p_creator_id, p_accessed_by, p_gift_id, p_reason);

  return query
  select
    pgp_sym_decrypt(pcd.legal_name_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.phone_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.address_line1_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.address_line2_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.address_city_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.address_postal_encrypted, v_key)::text,
    pgp_sym_decrypt(pcd.address_country_encrypted, v_key)::text
  from private.private_creator_data pcd
  where pcd.creator_id = p_creator_id;
end;
$$;

revoke execute on function public.get_creator_shipping_address(uuid, text, uuid, text) from public;
revoke execute on function public.get_creator_shipping_address(uuid, text, uuid, text) from anon;
grant execute on function public.get_creator_shipping_address(uuid, text, uuid, text) to service_role;

-- ============================================================
-- 5) Function: set_creator_shipping_address(...)
-- ============================================================
-- PRIVACY-CRITICAL
create or replace function public.set_creator_shipping_address(
  p_creator_id uuid,
  p_legal_name text,
  p_phone text,
  p_addr_line1 text,
  p_addr_line2 text,
  p_city text,
  p_postal text,
  p_country text
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_key text;
begin
  if auth.uid() is null or auth.uid() != p_creator_id then
    raise exception 'caller must be authenticated and can only modify their own shipping address';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'app_encryption_key';

  if v_key is null then
    raise exception 'encryption key not configured in vault';
  end if;

  insert into private.private_creator_data (
    creator_id,
    legal_name_encrypted,
    phone_encrypted,
    address_line1_encrypted,
    address_line2_encrypted,
    address_city_encrypted,
    address_postal_encrypted,
    address_country_encrypted,
    created_at,
    updated_at
  )
  values (
    p_creator_id,
    pgp_sym_encrypt(p_legal_name, v_key),
    pgp_sym_encrypt(p_phone, v_key),
    pgp_sym_encrypt(p_addr_line1, v_key),
    pgp_sym_encrypt(p_addr_line2, v_key),
    pgp_sym_encrypt(p_city, v_key),
    pgp_sym_encrypt(p_postal, v_key),
    pgp_sym_encrypt(p_country, v_key),
    now(),
    now()
  )
  on conflict (creator_id) do update set
    legal_name_encrypted = pgp_sym_encrypt(p_legal_name, v_key),
    phone_encrypted = pgp_sym_encrypt(p_phone, v_key),
    address_line1_encrypted = pgp_sym_encrypt(p_addr_line1, v_key),
    address_line2_encrypted = pgp_sym_encrypt(p_addr_line2, v_key),
    address_city_encrypted = pgp_sym_encrypt(p_city, v_key),
    address_postal_encrypted = pgp_sym_encrypt(p_postal, v_key),
    address_country_encrypted = pgp_sym_encrypt(p_country, v_key),
    updated_at = now();
end;
$$;

revoke execute on function public.set_creator_shipping_address(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.set_creator_shipping_address(uuid, text, text, text, text, text, text, text) from anon;
revoke execute on function public.set_creator_shipping_address(uuid, text, text, text, text, text, text, text) from service_role;
grant execute on function public.set_creator_shipping_address(uuid, text, text, text, text, text, text, text) to authenticated;

-- ============================================================
-- 6) Trigger: set_updated_at (creator_profiles, private_creator_data, wishlist_items)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.creator_profiles;
create trigger set_updated_at
before update on public.creator_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on private.private_creator_data;
create trigger set_updated_at
before update on private.private_creator_data
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.wishlist_items;
create trigger set_updated_at
before update on public.wishlist_items
for each row execute function public.set_updated_at();

