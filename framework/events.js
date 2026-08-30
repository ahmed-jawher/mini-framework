/**
 * events.js — the event system.
 *
 * Requirement: "this new way of handling events must be different from the
 * addEventListener() method that already exists."
 *
 * How this differs:
 *   - Nothing is ever bound to the element you create. Handlers declared as
 *     `onClick` attributes are stored in a registry keyed by an id stamped on
 *     the node, and ONE root-level dispatcher per event type walks the tree
 *     from the event target upwards, invoking whatever the registry holds.
 *   - Because handlers are data (a lookup) and not bindings, re-rendering a
 *     node never leaks listeners: the virtual DOM just overwrites the entry.
 *   - It adds a capability the DOM has no notion of: key combos (`onKey`).
 *
 * The single root dispatcher is registered with the browser's own
 * addEventListener — that is the one and only place it appears, and it is an
 * implementation detail users of the framework never touch.
 */

// nodeId -> { eventType: handler }
const handlers = new Map();
// eventType -> true, so we only install one root dispatcher per type
const installed = new Set();

let nextId = 1;
const ID = "__mfId";

/** Events that do not bubble: the root dispatcher listens in the capture phase. */
const NON_BUBBLING = new Set(["focus", "blur", "scroll", "mouseenter", "mouseleave"]);

function idOf(element, create) {
  if (element[ID]) return element[ID];
  if (!create) return null;
  const id = nextId++;
  Object.defineProperty(element, ID, { value: id, enumerable: false, configurable: true });
  return id;
}

function ensureDispatcher(type) {
  if (installed.has(type)) return;
  document.addEventListener(type, (event) => dispatch(event, type), NON_BUBBLING.has(type));
  installed.add(type);
}

function dispatch(event, type) {
  let node = event.target;
  let stopped = false;

  // Let handlers stop the framework's own walk, mirroring DOM semantics.
  const nativeStop = event.stopPropagation.bind(event);
  event.stopPropagation = () => { stopped = true; nativeStop(); };

  while (node && node.nodeType) {
    const id = node[ID];
    if (id) {
      const fn = handlers.get(id)?.[type];
      if (typeof fn === "function") {
        fn.call(node, event, node);
        if (stopped) break;
      }
    }
    if (NON_BUBBLING.has(type)) break; // these only ever target one node
    node = node.parentNode;
  }
}

/** Register a handler for a rendered element. Used by the virtual DOM. */
export function attachHandler(element, type, handler) {
  const id = idOf(element, true);
  let map = handlers.get(id);
  if (!map) handlers.set(id, (map = {}));
  map[type] = handler;
  ensureDispatcher(type);
}

/** Remove one handler from a rendered element. */
export function removeHandler(element, type) {
  const id = idOf(element, false);
  if (!id) return;
  const map = handlers.get(id);
  if (!map) return;
  delete map[type];
  if (Object.keys(map).length === 0) handlers.delete(id);
}

/** Forget every handler for an element and its subtree (called on removal). */
export function detachHandlers(node) {
  if (!node || !node.nodeType) return;
  const id = node[ID];
  if (id) handlers.delete(id);
  const children = node.childNodes;
  if (children) for (let i = 0; i < children.length; i++) detachHandlers(children[i]);
}

/**
 * Imperative binding for things outside the rendered tree — window resize,
 * document keydown. Returns an `off()` function.
 *
 *   const off = on(window, "scroll", () => ...)
 *   const off = on("keydown", (event) => ...)     // target defaults to document
 */
export function on(target, type, handler) {
  if (typeof target === "string") { handler = type; type = target; target = document; }
  const capture = NON_BUBBLING.has(type);
  target.addEventListener(type, handler, capture);
  return () => target.removeEventListener(type, handler, capture);
}

/**
 * Keybindings. `combo` is case-insensitive and accepts modifiers:
 *   onKey("Escape", fn)       onKey("ctrl+s", fn)      onKey("shift+?", fn)
 * Returns an `off()` function.
 */
export function onKey(combo, handler, options = {}) {
  const { target = document, type = "keydown", allowInInput = false } = options;
  const parts = String(combo).toLowerCase().split("+").map((p) => p.trim());
  const key = parts.pop();
  const need = {
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    meta: parts.includes("meta") || parts.includes("cmd"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
  };

  return on(target, type, (event) => {
    // An unmodified key must not hijack typing in a field.
    if (!allowInInput && isTypingTarget(event.target) && !need.ctrl && !need.meta) return;
    if (event.ctrlKey !== need.ctrl) return;
    if (event.metaKey !== need.meta) return;
    if (event.altKey !== need.alt) return;
    if (need.shift && !event.shiftKey) return;
    if (String(event.key || "").toLowerCase() !== key) return;
    handler(event);
  });
}

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}
