/** ISY994 utility functions — stateless mapping helpers */

import { INSTEON_CATEGORY_TO_DOMAIN } from './isy994.constants';

export function valueToState(value: number | null, domain: string): string {
  if (value === null) return 'unavailable';
  if (domain === 'binary_sensor') return value > 0 ? 'on' : 'off';
  return value > 0 ? 'on' : 'off';
}

export function buildAttributes(
  node: { name: string; type: string; address: string; value?: number | null; lastValue?: number | null },
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    friendly_name: node.name,
    isy_address: node.address,
    isy_type: node.type,
    isy_node: true,
  };

  const typeParts = (node.type ?? '').split('.').filter(Boolean);
  if (typeParts.length >= 1) {
    const cat = typeParts[0];
    attrs.isy_category = cat;
    attrs.device_class = mapDeviceClass(cat);
  }

  return attrs;
}

export function mapDeviceClass(category: string): string {
  switch (category) {
    case '16': return 'door';
    case '1':
    case '2': return 'light';
    default: return 'switch';
  }
}

export function domainForCategory(category: string): string {
  return INSTEON_CATEGORY_TO_DOMAIN[category] ?? 'switch';
}

export function buildEntityId(domain: string, address: string): string {
  const sanitized = address.toLowerCase().replace(/\s+/g, '_');
  return `${domain}.isy994_${sanitized}`;
}
