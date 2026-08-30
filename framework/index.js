/**
 * mini-framework — public entry point.
 *
 *   import { createApp, Component, h } from "./framework/index.js";
 *
 * Everything a user of the framework needs is re-exported here, so an
 * application only ever imports from one path.
 */

export { App, createApp } from "./app.js";
export { Component, NotFoundComponent } from "./component.js";
export { Store, createStore } from "./state.js";
export { Router, createRouter } from "./router.js";
export {
  createElement,
  h,
  createTextNode,
  isVNode,
  mount,
  patch,
  patchNode,
  render,
  toJSON,
  TEXT,
} from "./vdom.js";
export { on, onKey } from "./events.js";
