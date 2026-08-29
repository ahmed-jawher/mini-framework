/**
 * vdom.js — the DOM abstraction.
 *
 * A page is described as a plain object tree:
 *
 *   { tag: "div", attrs: { class: "nameSubm" }, children: [ ... ] }
 *
 * `createElement` builds those objects, `mount` turns one into real DOM, and
 * `patch` compares two of them and touches only the nodes that actually
 * differ. Keyed children (`{ key: id }`) are matched by identity rather than
 * by position, so reordering or deleting from the middle of a list moves the
 * existing nodes instead of rebuilding them — which is what keeps input focus
 * and checkbox state alive across renders.
 */

import { attachHandler, removeHandler, detachHandlers, normalizeType } from "./events.js";
import { setRef } from "./refs.js";

export const TEXT = "#text";

/* Function refs run after the tree is attached, not during mount().
   A node being mounted is not in the document yet, so `el.focus()` from a ref
   silently does nothing. Rendering is synchronous, so a microtask scheduled
   here fires once the whole tree has been committed and the node is live. */
const pendingRefs = [];
let refFlushScheduled = false;

function queueRef(fn, element) {
  pendingRefs.push([fn, element]);
  if (refFlushScheduled) return;
  refFlushScheduled = true;
  queueMicrotask(() => {
    refFlushScheduled = false;
    for (const [callback, el] of pendingRefs.splice(0)) {
      try {
        callback(el);
      } catch (error) {
        console.error("[framework] ref callback failed", error);
      }
    }
  });
}

/** Attributes that must be written as DOM properties, not attributes. */
const PROPERTIES = new Set(["value", "checked", "selected", "indeterminate", "innerHTML"]);
const BOOLEAN = new Set(["checked", "selected", "disabled", "readonly", "required", "autofocus", "multiple", "hidden", "open"]);

/**
 * createElement(tag, attrs?, children?)
 *
 *   createElement("h1", {}, ["Hello"])
 *   createElement("ul", { class: "list" }, items.map(renderItem))
 *   createElement("button", { onClick: save }, ["Save"])
 *
 * `attrs` may be omitted: createElement("p", ["text"]) works too.
 */
export function createElement(tag, attrs, children) {
  if (Array.isArray(attrs) || typeof attrs === "string" || typeof attrs === "number") {
    children = attrs;
    attrs = {};
  }
  attrs = attrs || {};
  const { key = null, ...rest } = attrs;
  return {
    tag: String(tag),
    attrs: rest,
    children: normalizeChildren(children),
    key: key === null || key === undefined ? null : String(key),
    el: null,
  };
}

/** Short alias — `h("li", {}, [...])`. */
export const h = createElement;

export function createTextNode(value) {
  return { tag: TEXT, attrs: {}, children: [], key: null, text: String(value), el: null };
}

export function isVNode(value) {
  return !!value && typeof value === "object" && typeof value.tag === "string";
}

function normalizeChildren(children) {
  const out = [];
  const walk = (child) => {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach(walk); return; }
    if (isVNode(child)) { out.push(child); return; }
    out.push(createTextNode(child));
  };
  walk(children);
  return out;
}

/* ── mounting ───────────────────────────────────────────────────────────── */

/** Turn a virtual node into a real DOM node. */
export function mount(vnode) {
  if (vnode.tag === TEXT) {
    const node = document.createTextNode(vnode.text);
    vnode.el = node;
    return node;
  }

  const element = vnode.attrs && vnode.attrs.xmlns
    ? document.createElementNS(vnode.attrs.xmlns, vnode.tag)
    : document.createElement(vnode.tag);

  for (const name of Object.keys(vnode.attrs)) {
    setAttribute(element, name, vnode.attrs[name]);
  }
  for (const child of vnode.children) {
    element.appendChild(mount(child));
  }

  vnode.el = element;
  return element;
}

/** Back-compat name used by the first version of this framework. */
export const VDomToRealDom = mount;

function setAttribute(element, name, value) {
  if (name === "key") return;

  if (name === "ref") {
    // String refs only record the element, so they can resolve immediately.
    if (typeof value === "function") queueRef(value, element);
    else setRef(String(value), element);
    return;
  }

  if (isEventName(name)) {
    if (typeof value === "function") attachHandler(element, name, value);
    else removeHandler(element, name);
    return;
  }

  if (name === "style") {
    applyStyle(element, value);
    return;
  }

  if (name === "class" || name === "className") {
    const cls = toClassName(value);
    if (cls) element.setAttribute("class", cls);
    else element.removeAttribute("class");
    return;
  }

  if (name === "dataset" && value && typeof value === "object") {
    for (const key of Object.keys(value)) element.dataset[key] = value[key];
    return;
  }

  if (PROPERTIES.has(name)) {
    // Writing `value`/`checked` as attributes only sets the *default*; the live
    // property is what the user sees, so set both where it matters.
    if (element[name] !== value) element[name] = value === null || value === undefined ? "" : value;
    if (BOOLEAN.has(name)) {
      if (value) element.setAttribute(name, "");
      else element.removeAttribute(name);
    }
    return;
  }

  if (BOOLEAN.has(name) || typeof value === "boolean") {
    if (value === false || value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? "" : String(value));
    return;
  }

  if (value === null || value === undefined) {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, String(value));
}

function removeAttribute(element, name, oldValue) {
  if (name === "key" || name === "ref") return;
  if (isEventName(name)) { removeHandler(element, name); return; }
  if (name === "style") { element.removeAttribute("style"); return; }
  if (name === "className") { element.removeAttribute("class"); return; }
  if (PROPERTIES.has(name)) {
    element[name] = name === "checked" || name === "selected" ? false : "";
    if (BOOLEAN.has(name)) element.removeAttribute(name);
    return;
  }
  if (name === "dataset" && oldValue && typeof oldValue === "object") {
    for (const key of Object.keys(oldValue)) delete element.dataset[key];
    return;
  }
  element.removeAttribute(name);
}

function isEventName(name) {
  return /^on[-A-Z]/.test(name) || (name.startsWith("on") && name.length > 2 && name === name.toLowerCase());
}

function toClassName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.keys(value).filter((k) => value[k]).join(" ");
  }
  return String(value);
}

function applyStyle(element, value) {
  if (typeof value === "string") { element.setAttribute("style", value); return; }
  element.removeAttribute("style");
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (v === null || v === undefined || v === false) continue;
      if (key.startsWith("--")) element.style.setProperty(key, String(v));
      else element.style[key] = v;
    }
  }
}

/* ── diffing ────────────────────────────────────────────────────────────── */

function isDifferentType(a, b) {
  if (a.tag !== b.tag) return true;
  if (a.key !== b.key) return true;
  return false;
}

/**
 * patch(parent, oldVNode, newVNode, index?)
 *
 * Applies the difference between two virtual trees to the real DOM living
 * under `parent` at `index`.
 */
export function patch(parent, oldVNode, newVNode, index = 0) {
  const existing = parent.childNodes[index];

  if (!oldVNode && newVNode) {
    parent.appendChild(mount(newVNode));
    return;
  }
  if (oldVNode && !newVNode) {
    if (existing) { detachHandlers(existing); parent.removeChild(existing); }
    return;
  }
  if (!oldVNode && !newVNode) return;

  if (!existing) {
    parent.appendChild(mount(newVNode));
    return;
  }

  if (isDifferentType(oldVNode, newVNode)) {
    detachHandlers(existing);
    parent.replaceChild(mount(newVNode), existing);
    return;
  }

  patchNode(existing, oldVNode, newVNode);
}

/** Patch a known DOM node in place against two virtual nodes of the same type. */
export function patchNode(element, oldVNode, newVNode) {
  newVNode.el = element;

  if (newVNode.tag === TEXT) {
    if (oldVNode.text !== newVNode.text) element.nodeValue = newVNode.text;
    return;
  }

  patchAttributes(element, oldVNode.attrs, newVNode.attrs);
  patchChildren(element, oldVNode.children, newVNode.children);
}

function patchAttributes(element, oldAttrs = {}, newAttrs = {}) {
  for (const name of Object.keys(oldAttrs)) {
    if (!(name in newAttrs)) removeAttribute(element, name, oldAttrs[name]);
  }
  for (const name of Object.keys(newAttrs)) {
    const next = newAttrs[name];
    const prev = oldAttrs[name];
    // Handlers are re-registered every render: the identity of an inline arrow
    // function changes each time, and the registry only ever holds one entry.
    if (isEventName(name)) { setAttribute(element, name, next); continue; }
    if (prev === next && !PROPERTIES.has(name) && typeof next !== "object") continue;
    setAttribute(element, name, next);
  }
}

function patchChildren(parent, oldChildren = [], newChildren = []) {
  const keyed = newChildren.some((c) => c.key !== null) || oldChildren.some((c) => c.key !== null);
  if (!keyed) {
    patchUnkeyed(parent, oldChildren, newChildren);
    return;
  }
  patchKeyed(parent, oldChildren, newChildren);
}

function patchUnkeyed(parent, oldChildren, newChildren) {
  const common = Math.min(oldChildren.length, newChildren.length);
  for (let i = 0; i < common; i++) patch(parent, oldChildren[i], newChildren[i], i);

  for (let i = common; i < newChildren.length; i++) {
    parent.appendChild(mount(newChildren[i]));
  }
  for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
    const node = parent.childNodes[i];
    if (node) { detachHandlers(node); parent.removeChild(node); }
  }
}

function patchKeyed(parent, oldChildren, newChildren) {
  // Snapshot the DOM nodes that belong to the old children before we move any.
  const oldNodes = [];
  for (let i = 0; i < oldChildren.length; i++) oldNodes[i] = parent.childNodes[i];

  const byKey = new Map();
  oldChildren.forEach((child, i) => {
    const key = child.key !== null ? `k:${child.key}` : `i:${i}`;
    if (!byKey.has(key)) byKey.set(key, { vnode: child, node: oldNodes[i], used: false });
  });

  const ordered = [];
  newChildren.forEach((child, i) => {
    const key = child.key !== null ? `k:${child.key}` : `i:${i}`;
    const match = byKey.get(key);
    if (match && !match.used && match.node && !isDifferentType(match.vnode, child)) {
      match.used = true;
      patchNode(match.node, match.vnode, child);
      ordered.push(match.node);
    } else {
      ordered.push(mount(child));
    }
  });

  // Remove whatever the new tree no longer references.
  for (const entry of byKey.values()) {
    if (!entry.used && entry.node && entry.node.parentNode === parent) {
      detachHandlers(entry.node);
      parent.removeChild(entry.node);
    }
  }

  // Put the surviving nodes in their new order.
  ordered.forEach((node, i) => {
    const current = parent.childNodes[i];
    if (current !== node) parent.insertBefore(node, current || null);
  });

  // Trim anything left over past the end (defensive).
  while (parent.childNodes.length > ordered.length) {
    const extra = parent.lastChild;
    detachHandlers(extra);
    parent.removeChild(extra);
  }
}

/**
 * render(vnode, container, oldVNode?) — mount or update a whole tree.
 * Returns the vnode that is now on screen, to be passed back next time.
 */
export function render(vnode, container, oldVNode = null) {
  if (!oldVNode) {
    container.textContent = "";
    container.appendChild(mount(vnode));
  } else {
    patch(container, oldVNode, vnode, 0);
  }
  return vnode;
}

/** Back-compat: the original signature (parent element, old tree, new tree). */
export function updateDOM(parent, oldVTree, newVTree) {
  if (!parent) return;
  patch(parent.parentNode || parent, oldVTree, newVTree, 0);
}

/** Debug helper: the JSON shape described in the brief. */
export function toJSON(vnode) {
  if (vnode.tag === TEXT) return vnode.text;
  return {
    tag: vnode.tag,
    attrs: { ...vnode.attrs },
    children: vnode.children.map(toJSON),
  };
}
