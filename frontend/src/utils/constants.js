export const CUSTOMER_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'HOUSE', label: 'House' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'SHOP', label: 'Shop' },
  { value: 'COMMERCIAL', label: 'Commercial Building' },
  { value: 'OTHER', label: 'Other Business' },
];

export const WATER_TYPES = [
  { value: 'DRINKING', label: 'Drinking Water' },
  { value: 'SALT', label: 'Salt Water' },
];

export const CUSTOMER_WATER_TYPES = [...WATER_TYPES, { value: 'BOTH', label: 'Both' }];

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

export const RECEIVED_BY = [
  { value: 'DRIVER', label: 'Driver collected' },
  { value: 'OWNER', label: 'Paid to owner / office' },
];

export const PAYMENT_STATUSES = [
  { value: 'PAID', label: 'Paid' },
  { value: 'PARTIAL', label: 'Partially Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
];

export const QUICK_QUANTITIES = [250, 500, 1000, 2000, 3000, 5000, 10000];

export const labelOf = (list, v) => list.find((x) => x.value === v)?.label || v || '—';
