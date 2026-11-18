/**
 * Applies the saved theme before first paint (no flash).
 * Theme is stored per device in localStorage: "light" | "dark" | "system".
 */
const script = `(function(){try{var t=localStorage.getItem("lifeos-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
