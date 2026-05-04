sql-- Fix: pgcrypto lives in the `extensions` schema in Supabase.
-- Add it to the search_path of the encryption-related functions.

alter function public.set_creator_shipping_address(uuid, text, text, text, text, text, text, text)
  set search_path = private, public, extensions;

alter function public.get_creator_shipping_address(uuid, text, uuid, text)
  set search_path = private, public, extensions;
