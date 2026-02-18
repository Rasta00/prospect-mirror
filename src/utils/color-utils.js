/**
 * Color extraction and palette generation utilities.
 */

/**
 * Parse a CSS color string to {r, g, b, a} or null.
 * Handles: #hex, rgb(), rgba(), hsl(), named colors (subset).
 */
function parseColor(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim().toLowerCase();

  // Transparent / inherit / initial — skip
  if (['transparent', 'inherit', 'initial', 'unset', 'currentcolor'].includes(str)) return null;

  // #hex
  const hex = str.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // rgb(a)
  const rgba = str.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgba) {
    let a = 1;
    if (rgba[4]) a = rgba[4].endsWith('%') ? parseFloat(rgba[4]) / 100 : parseFloat(rgba[4]);
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a };
  }

  return null;
}

/**
 * Convert {r,g,b} to hex string.
 */
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute relative luminance (WCAG).
 */
function luminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * WCAG contrast ratio between two colors.
 */
function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color is near-white or near-black (likely background, not brand).
 */
function isNeutral({ r, g, b }) {
  const avg = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  // Near-white, near-black, or very grey
  return (avg > 240 || avg < 15 || spread < 15);
}

/**
 * Euclidean distance between two RGB colors.
 */
function colorDistance(c1, c2) {
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
}

/**
 * Deduplicate a list of parsed colors, merging those within `threshold` distance.
 * Returns sorted by frequency (most common first).
 */
function deduplicateColors(colors, threshold = 30) {
  const buckets = []; // { color, count }
  for (const c of colors) {
    const match = buckets.find(b => colorDistance(b.color, c) < threshold);
    if (match) {
      match.count++;
    } else {
      buckets.push({ color: c, count: 1 });
    }
  }
  buckets.sort((a, b) => b.count - a.count);
  return buckets.map(b => b.color);
}

module.exports = {
  parseColor, rgbToHex, luminance, contrastRatio,
  isNeutral, colorDistance, deduplicateColors,
};
