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
import { Router, normalizePath } from "./router.js";
import { Store } from "./state.js";
import { createElement, render as renderTree } from "./vdom.js";

export class App {
  constructor({ root = "#app", state = {} } = {}) {
    this.root = typeof root === "string" ? document.querySelector(root) : root;
    if (!this.root) throw new Error(`[framework] root element "${root}" was not found`);

    this.store = new Store(state);
    this.router = new Router();
    this.oldTree = null;
    this.currentComponent = null;
    this._instances = new Map();        // route pattern -> component instance
    this._routeComponents = new Map();  // route pattern -> component class
    this._frame = null;
    this._started = false;

    this.store.subscribe(() => this.requestRender());
    this.router.onChange(() => this.renderNow());
  }

  /** route(path, ComponentClass) */
  route(path, component) {
    this.router.add(path);
    this._routeComponents.set(normalizePath(path), component);
    return this;
  }

  /* ── state passthrough ── */

  getState(key, fallback) { return this.store.get(key, fallback); }
  setState(key, value) { return this.store.set(key, value); }

  /* ── rendering ── */

  /** Coalesce many change notifications into one DOM update. */
  requestRender() {
    if (!this._started || this._frame !== null) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.renderNow();
    });
  }

  /** Render synchronously, right now. */
  renderNow() {
    if (!this._started) return;
    const context = this.router.current || this.router.match(this.router.getPath());

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
      // A thrown render would otherwise leave a blank page and no clue why.
      console.error("[framework] render failed", error);
      tree = createElement("pre", { class: "framework-error" }, [String(error && error.stack || error)]);
    }

    const isFirstPaint = this.oldTree === null;
    this.oldTree = renderTree(tree, this.root, this.oldTree);

    const isNewComponent = this.currentComponent !== component;
    this.currentComponent = component;

    if (isNewComponent || isFirstPaint) component._mount();
    else component._update();

    return tree;
  }

  /** One instance per route, so component state survives re-renders. */
  _componentFor(key, context) {
    const Definition = key === "__notfound__"
      ? NotFoundComponent
      : this._routeComponents.get(key);

    let instance = this._instances.get(key);
    if (!instance) {
      instance = new Definition(this, context);
      this._instances.set(key, instance);
    }
    instance.context = context;
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
}

export function createApp(options) {
  return new App(options);
}
