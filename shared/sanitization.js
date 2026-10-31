export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|credential|token|csrf/i.test(key)).map(([key, item]) => [key, stripSecrets(item)]));
}
