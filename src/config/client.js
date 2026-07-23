// ============================================================================
//  CLIENT CONFIG (FRONTEND)  —  edit these values per client.
//  This is the ONLY file you change to rebrand the app's look and name.
//  (The AI assistant's persona + questions live separately, in the
//   ai-qualify edge function's CLIENT block.)
// ============================================================================

export const CLIENT = {
  name:      "Baynest Realty",   // full company name, shown across the UI
  shortName: "Baynest",          // short form, used in the browser tab title
  tagline:   "Team access",      // small line under the logo on the login screen
  logo:      "/assets/logo.png", // drop the client logo here (transparent PNG)

  // Brand colours — taken from the logo, deliberately muted.
  // These are injected as CSS variables at startup (see applyBrand), and the
  // whole UI palette references them, so the app re-themes from this one place.
  colors: {
    primary:      "#1B4C5E", // deep teal — logo mark + wordmark
    primaryDark:  "#123642", // darker teal (active nav, gradients)
    primaryLight: "#2C6579", // lighter teal
    accent:       "#C08A45", // muted gold — the logo's sun arc (CTAs, highlights)
    accentSoft:   "#D2A05C", // lighter gold (badges, active icons)
    accentPale:   "#E3D2B0", // pale sand (subtle fills)
    muted:        "#3E6B78", // steel teal, secondary UI
    tint:         "#EFE7D9", // soft sand fills
    tintSoft:     "#F6F1E7", // lightest sand
    appBg:        "#F2EFE9", // warm cream page ground (the logo's background)
  },
};

// Push the brand colours into CSS custom properties so every var(--brand-*) /
// var(--app-bg) in the app follows from this config.
export function applyBrand(c = CLIENT) {
  const r = document.documentElement.style;
  const k = c.colors;
  r.setProperty("--brand-primary",       k.primary);
  r.setProperty("--brand-primary-dark",  k.primaryDark);
  r.setProperty("--brand-primary-light", k.primaryLight);
  r.setProperty("--brand-accent",        k.accent);
  r.setProperty("--brand-accent-soft",   k.accentSoft);
  r.setProperty("--brand-accent-pale",   k.accentPale);
  r.setProperty("--brand-muted",         k.muted);
  r.setProperty("--brand-tint",          k.tint);
  r.setProperty("--brand-tint-soft",     k.tintSoft);
  r.setProperty("--app-bg",              k.appBg);
  document.title = `${c.shortName} WA CRM`;
}

export default CLIENT;
