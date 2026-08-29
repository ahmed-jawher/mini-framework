/**
 * router.js — keeps the URL and the application state in sync.
 *
 * Two modes:
 *   "hash"    (default)  #/active           — works from file:// and from any
 *                                             static server with no config.
 *   "history"            /active            — pretty URLs; needs the server to
 *                                             fall back to index.html.
 *
 * Patterns support named parameters and a wildcard:
 *   "/", "/todos/:id", "/files/*"
 *
 * A route change is just another state change: the router reports the new
 * location and the app re-renders. Back/forward buttons work because we listen
 * for `popstate`/`hashchange` rather than only reacting to our own navigate().
 */

export class Router {
  constructor({ mode = "hash", base = "" } = {}) {
    this.mode = mode === "history" ? "history" : "hash";
    this.base = base.replace(/\/$/, "");
    this.routes = [];
    this.fallback = null;
    this.listeners = new Set();
    this.current = null;
    this.started = false;
    this._onPopState = () => this._resolve();
  }

  /** add("/todos/:id", handler) — handler(context) where context has params. */
  add(pattern, handler) {
    const normalized = normalizePath(pattern).split("?")[0];
    this.routes.push({ pattern: normalized, handler, ...compile(pattern) });
    return this;
  }

  /** Alias so `router.route(...)` reads naturally too. */
  route(pattern, handler) {
    return this.add(pattern, handler);
  }

  /** Handler used when nothing matches. */
  notFound(handler) {
    this.fallback = handler;
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
    const event = this.mode === "hash" ? "hashchange" : "popstate";
    window.addEventListener(event, this._onPopState);
    if (this.mode === "hash" && !window.location.hash) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#/`);
    }
    this._resolve();
    return this;
  }

  stop() {
    if (!this.started) return;
    const event = this.mode === "hash" ? "hashchange" : "popstate";
    window.removeEventListener(event, this._onPopState);
    this.started = false;
  }

  /** The path the browser is currently showing, normalised to start with "/". */
  getPath() {
    if (this.mode === "hash") {
      const hash = window.location.hash.slice(1);
      return normalizePath(hash || "/");
    }
    let path = window.location.pathname + window.location.search;
    if (this.base && path.startsWith(this.base)) path = path.slice(this.base.length);
    return normalizePath(path || "/");
  }

  /** Build the href a link should use for a given path. */
  href(path) {
    const clean = normalizePath(path);
    return this.mode === "hash" ? `#${clean}` : `${this.base}${clean}`;
  }

  /** navigate("/active") or navigate("/active", { replace: true }). */
  navigate(path, { replace = false } = {}) {
    const clean = normalizePath(path);
    if (this.mode === "hash") {
      const url = `${window.location.pathname}${window.location.search}#${clean}`;
      if (replace) window.history.replaceState({}, "", url);
      else window.history.pushState({}, "", url);
    } else {
      const url = `${this.base}${clean}`;
      if (replace) window.history.replaceState({}, "", url);
      else window.history.pushState({}, "", url);
    }
    this._resolve();
    return this;
  }

  back() { window.history.back(); }
  forward() { window.history.forward(); }

  /** Match a path without navigating. */
  match(path) {
    const clean = normalizePath(path);
    const [pathname, queryString = ""] = clean.split("?");
    for (const route of this.routes) {
      const found = route.regex.exec(pathname);
      if (!found) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = safeDecode(found[i + 1]);
      });
      return {
        route: route.pattern,
        handler: route.handler,
        path: pathname,
        params,
        query: parseQuery(queryString),
      };
    }
    return {
      route: null,
      handler: this.fallback,
      path: pathname,
      params: {},
      query: parseQuery(queryString),
    };
  }

  _resolve() {
    const context = this.match(this.getPath());
    context.router = this;
    this.current = context;
    if (typeof context.handler === "function") context.handler(context);
    for (const listener of Array.from(this.listeners)) listener(context);
    return context;
  }
}

export function createRouter(options) {
  return new Router(options);
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function normalizePath(path) {
  let clean = String(path == null ? "/" : path).trim();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (!clean.startsWith("/")) clean = `/${clean}`;
  // Strip a trailing slash, but never turn "/" into "".
  const [p, q] = clean.split("?");
  const trimmed = p.length > 1 ? p.replace(/\/+$/, "") || "/" : p;
  return q === undefined ? trimmed : `${trimmed}?${q}`;
}

function compile(pattern) {
  const keys = [];
  let wildcards = 0;
  const source = normalizePath(pattern)
    .split("?")[0]
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/:(\w+)/g, (_, key) => { keys.push(key); return "([^/]+)"; })
    // Several wildcards in one pattern each get their own name — "wildcard",
    // "wildcard2", "wildcard3" — so a later one cannot overwrite an earlier.
    .replace(/\*/g, () => {
      wildcards++;
      keys.push(wildcards === 1 ? "wildcard" : `wildcard${wildcards}`);
      return "(.*)";
    });
  return { regex: new RegExp(`^${source}/?$`), keys };
}

function parseQuery(queryString) {
  const query = {};
  if (!queryString) return query;
  for (const pair of queryString.split("&")) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    const key = safeDecode(index === -1 ? pair : pair.slice(0, index));
    const value = index === -1 ? "" : safeDecode(pair.slice(index + 1));
    query[key] = value;
  }
  return query;
}

function safeDecode(value) {
  if (value === undefined) return value;
  try { return decodeURIComponent(value); } catch (_) { return value; }
}
