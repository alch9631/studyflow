export const ACCENT_KEY = "studyflow.mobile.accent.v1";

export function normalizeAccent(value: string | null): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

function luminance(color: string) {
  const channels = [1, 3, 5].map(start => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function textOnAccent(color: string) {
  return luminance(color) > 0.179 ? "#000000" : "#FFFFFF";
}

// Keep the chosen color on fills; lift very dark/light accents only where they
// must remain legible as text and icons against the page background.
export function readableAccent(color: string, background: string) {
  const base = luminance(background);
  const contrast = (candidate: string) => {
    const value = luminance(candidate);
    return (Math.max(base, value) + 0.05) / (Math.min(base, value) + 0.05);
  };
  const target = base < 0.5 ? 255 : 0;
  for (let step = 0; step <= 20; step++) {
    const candidate = "#" + [1, 3, 5].map(start => {
      const channel = parseInt(color.slice(start, start + 2), 16);
      return Math.round(channel + (target - channel) * step / 20).toString(16).padStart(2, "0");
    }).join("");
    if (contrast(candidate) >= 4.5) return candidate.toUpperCase();
  }
  return target ? "#FFFFFF" : "#000000";
}
