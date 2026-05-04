-- Shipping status helpers: metadata only, never cleartext address.

-- Returns only metadata about the shipping address, NEVER the cleartext.
-- Caller can be the owner via authenticated context.
create or replace function public.get_creator_shipping_status(p_creator_id uuid)
returns table (
  has_address boolean,
  address_validated boolean,
  address_validated_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if auth.uid() is null or auth.uid() != p_creator_id then
    raise exception 'caller must be authenticated and can only check their own status';
  end if;

  return query
  select
    (legal_name_encrypted is not null) as has_address,
    coalesce(pcd.address_validated, false) as address_validated,
    pcd.address_validated_at
  from private.private_creator_data pcd
  where pcd.creator_id = p_creator_id;
end;
$$;

revoke execute on function public.get_creator_shipping_status(uuid) from public, anon;
grant execute on function public.get_creator_shipping_status(uuid) to authenticated;

-- Marks the address as validated. Owner-only. No address content involved.
create or replace function public.set_address_validated(p_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if auth.uid() is null or auth.uid() != p_creator_id then
    raise exception 'caller must be authenticated and can only validate their own address';
  end if;

  update private.private_creator_data
  set address_validated = true, address_validated_at = now()
  where creator_id = p_creator_id;
end;
$$;

revoke execute on function public.set_address_validated(uuid) from public, anon;
grant execute on function public.set_address_validated(uuid) to authenticated;
