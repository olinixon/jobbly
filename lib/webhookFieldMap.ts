export const webhookFieldMap: Record<string, string> = {
  customer_name: 'customer_name',
  full_name: 'customer_name',
  name: 'customer_name',
  customer_phone: 'customer_phone',
  phone: 'customer_phone',
  mobile: 'customer_phone',
  customer_email: 'customer_email',
  email: 'customer_email',
  property_address: 'property_address',
  address: 'property_address',
  property_perimeter_m: 'property_perimeter_m',
  perimeter: 'property_perimeter_m',
  property_area_m2: 'property_area_m2',
  area: 'property_area_m2',
  property_storeys: 'storey_count',      // n8n sends "property_storeys" → maps to internal "storey_count"
  storeys: 'property_storeys',
  floors: 'property_storeys',
  gutter_guards: 'gutter_guards',        // n8n sends "gutter_guards" → maps to internal "gutter_guards"
  contractor_rate: 'contractor_rate',
  call_id: 'call_id',
  call_timestamp: 'call_timestamp',
  timestamp: 'call_timestamp',
}

export function mapWebhookPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const internalKey = webhookFieldMap[key]
    if (internalKey) {
      mapped[internalKey] = value
    }
  }
  return mapped
}
