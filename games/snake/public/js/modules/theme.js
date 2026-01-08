const KEY = "snake.theme";

export function createTheme(){
  function get(){
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function set(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }

  function toggle(){
    const next = get() === "dark" ? "light" : "dark";
    set(next);
  }

  function applySaved(){
    const saved = localStorage.getItem(KEY);
    if(saved === "light" || saved === "dark"){
      set(saved);
    } else {
      // default: follow system preference
      const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      set(prefersLight ? "light" : "dark");
    }
  }

  return { get, set, toggle, applySaved };
}
