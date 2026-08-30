/**
 * router.js — keeps the URL and the application state in sync.
 *
 * Hash URLs (`#/active`) so the app runs from any static file server with no
 * configuration. Patterns support named parameters: "/", "/todos/:id".
 *
 * A route change is just another state change: the router reports the new
 * location and the app re-renders. Back/forward buttons work because we listen
 * for `hashchange` rather than only reacting to our own navigate().
 */

export class Router {
  constructor() {
    this.routes = [];
    this.listeners = new Set();
    this.current = null;
    this.started = false;
    this._onHashChange = () => this._resolve();
  }

  /** add("/todos/:id") — registers a pattern to match against the URL. */
  add(pattern) {
    this.routes.push({ pattern: normalizePath(pattern), ...compile(pattern) });
    return this;
  }

  /** onChange(cb) — cb(context) after every resolved navigation. */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begin listening and resolve the current URL. */
  start() {
    if (this.started) return this;
    this.started = true;
    window.addEventListener("hashchange", this._onHashChange);
    if (!window.location.hash) {
      window.history.replaceState({}, "", `${window.location.pathname}#/`);
    }
    this._resolve();
    return this;
  }

  /** The path the browser is currently showing, normalised to start with "/". */
  getPath() {
    return normalizePath(window.location.hash.slice(1) || "/");
  }

  /** Build the href a link should use for a given path. */
  href(path) {
    return `#${normalizePath(path)}`;
  }

  /** navigate("/active") or navigate("/active", { replace: true }). */
  navigate(path, { replace = false } = {}) {
    const url = `${window.location.pathname}#${normalizePath(path)}`;
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    this._resolve();
    return this;
  }

  /** Match a path without navigating. */
  match(path) {
    const clean = normalizePath(path);
    for (const route of this.routes) {
      const found = route.regex.exec(clean);
      if (!found) continue;
      const params = {};
      route.keys.forEach((key, i) => { params[key] = safeDecode(found[i + 1]); });
      return { route: route.pattern, path: clean, params };
    }
    return { route: null, path: clean, params: {} };
  }

  _resolve() {
    const context = this.match(this.getPath());
    context.router = this;
    this.current = context;
    for (const listener of Array.from(this.listeners)) listener(context);
    return context;
  }
}

export function createRouter() {
  return new Router();
}

/* ── helpers ────────────────────────────────────────────────────────────── */

/** "#/active/" and "active" both become "/active"; "/" stays "/". */
export function normalizePath(path) {
  let clean = String(path == null ? "/" : path).trim();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (!clean.startsWith("/")) clean = `/${clean}`;
  return clean.length > 1 ? clean.replace(/\/+$/, "") || "/" : clean;
}

/** "/todos/:id" -> /^\/todos\/([^/]+)\/?$/ plus the parameter name "id". */
function compile(pattern) {
  const keys = [];
  const source = normalizePath(pattern)
    .replace(/[.+*^${}()|[\]\\]/g, "\\$&")
    .replace(/:(\w+)/g, (_, key) => { keys.push(key); return "([^/]+)"; });
  return { regex: new RegExp(`^${source}/?$`), keys };
}

function safeDecode(value) {
  if (value === undefined) return value;
  try { return decodeURIComponent(value); } catch (_) { return value; }
}
