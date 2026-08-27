// Shared helpers for matching free-text column headers (e.g. from an uploaded
// Excel sheet) to a tenant's blueprint field keys.

export const normalize = (str: string | null | undefined): string =>
  (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Common header synonyms -> canonical blueprint field key.
export const FIELD_ALIASES: Record<string, string[]> = {
  client_name: ['company_name', 'client', 'customer_name', 'customer', 'account', 'party'],
  contact_person: ['contact', 'person', 'contactname', 'attn'],
  email_id: ['email', 'client_email', 'email_address', 'mail', 'emailid'],
  phone_number: ['phone', 'client_phone', 'contact_number', 'mobile', 'tel', 'contactno'],
  billing_address: ['address', 'client_address', 'shipping_address', 'location', 'city'],
  payment_terms: ['payment', 'terms', 'paymentterm'],
  delivery_terms: ['delivery', 'incoterms', 'shipping_terms'],
  subtotal: ['total_value', 'ta', 'total_amount', 'total', 'amount', 'value'],
  freight: ['freight_terms'],
  source_ref: ['reference', 'source', 'lead_source', 'ref'],
  item_name: ['name', 'product_name', 'product', 'description', 'material', 'item'],
  item_code: ['code', 'hsn', 'sku', 'itemcode', 'partno'],
  quantity: ['qty', 'quantity', 'nos', 'count'],
  uom: ['unit', 'units', 'measure', 'uom'],
  item_rate: ['rate', 'price', 'unitprice', 'unit_rate'],
  item_br: ['basic_rate', 'line_total', 'linetotal', 'itemtotal'],
};

/**
 * Best-effort match of a raw header string to one of `fieldNames`.
 * Returns the matched field key, or null when nothing is confident enough.
 */
export function matchHeader(
  header: string,
  fieldNames: string[]
): string | null {
  const h = normalize(header);
  if (!h) return null;

  const normalizedFields = fieldNames.map((f) => ({ raw: f, norm: normalize(f) }));

  // 1. Exact normalized match against a real field key.
  const exact = normalizedFields.find((f) => f.norm === h);
  if (exact) return exact.raw;

  // 2. Alias table: header matches a known synonym of a field key.
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (normalize(canonical) === h || aliases.some((a) => normalize(a) === h)) {
      const field = normalizedFields.find((f) => f.norm === normalize(canonical));
      if (field) return field.raw;
    }
  }

  // 3. Substring containment either direction (e.g. "Client Name (Legal)").
  const contains = normalizedFields.find(
    (f) => f.norm.length >= 3 && (h.includes(f.norm) || f.norm.includes(h))
  );
  if (contains) return contains.raw;

  // 4. Alias substring containment.
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const pool = [canonical, ...aliases].map(normalize);
    if (pool.some((p) => p.length >= 3 && (h.includes(p) || p.includes(h)))) {
      const field = normalizedFields.find((f) => f.norm === normalize(canonical));
      if (field) return field.raw;
    }
  }

  return null;
}

/** Auto-map an ordered list of sheet headers to field keys. */
export function autoMapColumns(
  headers: string[],
  fieldNames: string[]
): { header: string; keyName: string | null }[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const match = matchHeader(header, fieldNames);
    if (match && !used.has(match)) {
      used.add(match);
      return { header, keyName: match };
    }
    return { header, keyName: null };
  });
}
