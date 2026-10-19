// Read by both the root layout (server) and the toggle (client).
export const THEME_KEY = "scripture.theme";

/**
 * The theme everyone gets, with the toggle hidden. Light for now; set it to
 * null to bring back the toggle and the saved or system theme.
 */
export const LOCKED_THEME: "light" | "dark" | null = "light";

/** Runs before first paint so a saved theme never flashes the other one. */
export const themeScript = LOCKED_THEME
  ? `document.documentElement.dataset.theme=${JSON.stringify(LOCKED_THEME)}`
  : `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
