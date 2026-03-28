export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;

  const trimmed = raw.trim();

  if (trimmed.startsWith('+')) {
    // Already in correct format
    return trimmed;
  }

  if (trimmed.startsWith('64')) {
    // Country code present but missing the plus — prepend it
    return '+' + trimmed;
  }

  if (trimmed.startsWith('0')) {
    // Local format — replace leading 0 with +64
    return '+64' + trimmed.slice(1);
  }

  // Unrecognised format — return as-is, do not error
  return trimmed;
}
