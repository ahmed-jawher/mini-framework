/**
 * component.js — the unit of UI.
 *
 * A component owns a piece of the screen. You implement `render()` and return
 * a virtual node; the framework decides when to call it. That is the inversion
 * of control: you never call `render()` yourself.
 *
 * Lifecycle, in order:
 *   onMount()    once, right after the component's markup first reaches the DOM
 *   onUpdate()   after every subsequent re-render of this component
 *   onUnmount()  when the route moves away, before the markup is replaced
 *
 * Anything returned by `onMount` that is a function is treated as a cleanup
 * and run on unmount, which is the tidy way to dispose of `on(...)` handlers.
 */

import { createElement } from "./vdom.js";

export class Component {
  constructor(app, context = {}) {
    this.app = app;
    this.store = app ? app.store : null;
    this.router = app ? app.router : null;
    this.context = context;      // { path, params, query, route }
    this.props = context.props || {};
    this.state = {};             // component-local state
    this._cleanups = [];
    this._mounted = false;
  }

  /** Component-local state. Merges and asks the app to re-render. */
  setState(patch) {
    const partial = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...partial };
    if (this.app) this.app.requestRender();
    return this.state;
  }

  /** Shared application state — same store everywhere. */
  getState(path, fallback) {
    return this.store ? this.store.get(path, fallback) : fallback;
  }

  setGlobalState(path, value) {
    return this.store ? this.store.set(path, value) : undefined;
  }

  /** Register a teardown to run on unmount (e.g. the `off()` from `on(...)`). */
  onCleanup(fn) {
    if (typeof fn === "function") this._cleanups.push(fn);
    return fn;
  }

  navigate(path, options) {
    if (this.router) this.router.navigate(path, options);
  }

  /* ── lifecycle hooks: override in your component ── */
  onMount() {}
  onUpdate() {}
  onUnmount() {}

  /** Override this. Must return a virtual node. */
  render() {
    return createElement("div", {}, ["Component"]);
  }

  /* ── called by the framework ── */
  _mount() {
    if (this._mounted) return;
    this._mounted = true;
    const cleanup = this.onMount();
    if (typeof cleanup === "function") this._cleanups.push(cleanup);
  }

  _update() {
    if (this._mounted) this.onUpdate();
  }

  _unmount() {
    if (!this._mounted) return;
    this._mounted = false;
    this.onUnmount();
    for (const fn of this._cleanups.splice(0)) {
      try { fn(); } catch (error) { console.error("[framework] cleanup failed", error); }
    }
  }
}

export class NotFoundComponent extends Component {
  render() {
    return createElement("section", { class: "not-found" }, [
      createElement("h1", {}, ["404 — Not Found"]),
      createElement("p", {}, [`No route matches ${this.context.path || ""}`]),
      createElement("a", { href: this.router ? this.router.href("/") : "#/" }, ["Go home"]),
    ]);
  }
}
