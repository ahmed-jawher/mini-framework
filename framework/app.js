/**
 * app.js — wiring. The object that calls you.
 *
 *   const app = createApp({ root: "#app", state: { todos: [] } });
 *   app.route("/", TodoList);
 *   app.start();
 *
 * `App` subscribes to the store and to the router; when either changes it
 * schedules a re-render on the next animation frame. Many state writes in one
 * tick therefore produce exactly one DOM update.
 */

import { Component, NotFoundComponent } from "./component.js";
import { Router } from "./router.js";
import { Store } from "./state.js";
import { createElement, render as renderTree } from "./vdom.js";
import { pruneRefs } from "./refs.js";

export class App {
  constructor({ root = "#app", state = {}, mode = "hash", base = "" } = {}) {
    this.root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.root) throw new Error(`[framework] root element "${root}" was not found`);

    this.store = new Store(state);
    this.router = new Router({ mode, base });
    this.oldTree = null;
    this.currentComponent = null;
    this.currentRouteKey = null;
    this._instances = new Map();   // route pattern -> component instance
    this._routeComponents = new Map();
    this._frame = null;
    this._started = false;
    this._middlewares = [];

    this.router.notFound(() => {});
    this._unsubscribeStore = this.store.subscribe(() => this.requestRender());
    this._unsubscribeRouter = this.router.onChange(() => this.renderNow());
  }

  /* ── routes ── */

  /**
   * route(path, ComponentClassOrFunction)
   * A function component receives (context, app) and returns a virtual node.
   */
  route(path, component) {
    this.router.add(path, () => {});
    this._routeComponents.set(normalize(path), component);
    return this;
  }

  /** Component used when no route matches. */
  setNotFound(component) {
    this._notFound = component;
    return this;
  }

  /** Run `fn(context)` before every render; return false to cancel navigation. */
  use(fn) {
    this._middlewares.push(fn);
    return this;
  }

  /* ── state passthrough ── */

  getState(path, fallback) { return this.store.get(path, fallback); }
  setState(path, value) {
    // setState("key", value) or setState({ key: value })
    if (typeof path === "object" && path !== null) return this.store.setState(path);
    return this.store.set(path, value);
  }
  subscribe(listener) { return this.store.subscribe(listener); }
  navigate(path, options) { this.router.navigate(path, options); return this; }

  /* ── rendering ── */

  /** Coalesce many change notifications into one DOM update. */
  requestRender() {
    if (!this._started || this._frame !== null) return;
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
    this._frame = schedule(() => {
      this._frame = null;
      this.renderNow();
    });
  }

  /** Render synchronously, right now. */
  renderNow() {
    if (!this._started) return;
    const context = this.router.current || this.router.match(this.router.getPath());
    context.app = this;

    for (const middleware of this._middlewares) {
      if (middleware(context, this) === false) return;
    }

    const key = context.route === null ? "__notfound__" : context.route;
    const component = this._componentFor(key, context);

    // Route changed: unmount the outgoing component first.
    if (this.currentComponent && this.currentComponent !== component) {
      this.currentComponent._unmount();
    }

    let tree;
    try {
      tree = component.render();
    } catch (error) {
      console.error("[framework] render failed", error);
      tree = createElement("pre", { class: "framework-error" }, [String(error && error.stack || error)]);
    }

    const isFirstPaint = this.oldTree === null;
    this.oldTree = renderTree(tree, this.root, this.oldTree);

    const isNewComponent = this.currentComponent !== component;
    this.currentComponent = component;
    this.currentRouteKey = key;

    if (isNewComponent || isFirstPaint) component._mount();
    else component._update();

    pruneRefs();
    return tree;
  }

  _componentFor(key, context) {
    const registry = this._routeComponents;
    const Definition = key === "__notfound__"
      ? (this._notFound || NotFoundComponent)
      : registry.get(key);

    if (!Definition) {
      return this._instanceOf("__notfound__", this._notFound || NotFoundComponent, context);
    }
    return this._instanceOf(key, Definition, context);
  }

  _instanceOf(key, Definition, context) {
    const isClass = typeof Definition === "function"
      && Definition.prototype
      && (Definition.prototype instanceof Component || Definition.prototype.render);

    // Function component: wrap it so it gets the same lifecycle contract.
    if (!isClass) {
      let instance = this._instances.get(key);
      if (!instance) {
        instance = new Component(this, context);
        instance.render = () => {
          const result = Definition(instance.context, this);
          return result || createElement("div", {}, []);
        };
        this._instances.set(key, instance);
      }
      instance.context = context;
      instance.props = context.props || {};
      return instance;
    }

    let instance = this._instances.get(key);
    if (!instance || !(instance instanceof Definition)) {
      instance = new Definition(this, context);
      this._instances.set(key, instance);
    }
    instance.context = context;
    instance.props = context.props || {};
    return instance;
  }

  /* ── lifecycle ── */

  start() {
    if (this._started) return this;
    this._started = true;
    this.router.start();          // triggers onChange -> renderNow()
    if (this.oldTree === null) this.renderNow();
    return this;
  }

  /** Tear everything down (useful in tests). */
  destroy() {
    if (this.currentComponent) this.currentComponent._unmount();
    this.router.stop();
    this._unsubscribeStore();
    this._unsubscribeRouter();
    this._instances.clear();
    this.root.textContent = "";
    this.oldTree = null;
    this._started = false;
  }
}

function normalize(path) {
  let clean = String(path || "/");
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (!clean.startsWith("/")) clean = `/${clean}`;
  return clean.length > 1 ? clean.replace(/\/+$/, "") || "/" : clean;
}

export function createApp(options) {
  return new App(options);
}
