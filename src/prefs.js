const NS = 'startrek1971.';

export function loadPref(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(NS + key, String(value));
  } catch {
    // Storage unavailable (private mode, quota); silently ignore.
  }
}
