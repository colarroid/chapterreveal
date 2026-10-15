// Read by both the root layout (server) and the toggle (client).
export const THEME_KEY = "scripture.theme";

/** Runs before first paint so a saved theme never flashes the other one. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
