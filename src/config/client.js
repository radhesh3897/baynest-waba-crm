// ============================================================================
//  CLIENT CONFIG (FRONTEND)  —  edit these values per client.
//  This is the ONLY file you change to rebrand the app's look and name.
//  (The AI assistant's persona + questions live separately, in the
//   ai-qualify edge function's CLIENT block.)
// ============================================================================

export const CLIENT = {
  name:      "Done For You",       // full company name, shown across the UI
  shortName: "DFY",                // short form, used in the browser tab title
  tagline:   "Internal team access", // small line under the logo on the login screen
  logo:      "/assets/logo.png",   // drop the client logo in public/assets/logo.png

  // Brand colours. Change these four and the whole UI re-themes — they are
  // injected as CSS variables at startup (see applyBrand in main.jsx). Solid hex.
  colors: {
    primary:      "#15514B", // main brand colour: sidebar, headers, primary buttons
    primaryDark:  "#0E3A35", // darker shade
    primaryLight: "#1C5E56", // lighter shade
    accent:       "#5BB957", // accent / call-to-action green
  },
};

// Push the brand colours into CSS custom properties so every `var(--brand-*)`
// in the app (and the whole --dfy-* palette, which now references them) follows.
export function applyBrand(c = CLIENT) {
  const r = document.documentElement.style;
  r.setProperty("--brand-primary",       c.colors.primary);
  r.setProperty("--brand-primary-dark",  c.colors.primaryDark);
  r.setProperty("--brand-primary-light", c.colors.primaryLight);
  r.setProperty("--brand-accent",        c.colors.accent);
  document.title = `${c.shortName} WA CRM`;
}

export default CLIENT;
