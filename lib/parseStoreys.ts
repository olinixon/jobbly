export function parseStoreys(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  // If already a number, return it directly (guard against n8n sending a real int)
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }

  const str = String(raw).trim().toLowerCase();

  if (!str || str === 'unsure' || str === 'unknown' || str === 'not sure') return null;

  // Word-to-number mappings
  const wordMap: Record<string, number> = {
    'one': 1, 'single': 1, '1': 1, '1 stor': 1,
    'two': 2, 'double': 2, '2': 2, '2 stor': 2,
    'three': 3, 'triple': 3, '3': 3, '3 stor': 3,
    'split': 1,   // split-level treated as single storey for quoting
    'ground': 1,
  };

  // Check word map first (partial match — "single storey", "two storey", "split-level")
  for (const [key, value] of Object.entries(wordMap)) {
    if (str.includes(key)) return value;
  }

  // Last resort — extract the first digit from the string
  const match = str.match(/\d+/);
  if (match) {
    const n = parseInt(match[0], 10);
    return n > 0 ? n : null;
  }

  return null;
}
