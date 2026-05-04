/** Metadata only — never includes cleartext address fields. */
export type CreatorShippingStatusDto = {
  has_address: boolean;
  validated_at: string | null;
};
