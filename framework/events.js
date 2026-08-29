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
 *   - It adds capabilities the DOM has no notion of: key combos (`onKey`),
 *     an application-level pub/sub bus (`emit` / `subscribe`), and
 *     `once` / `off` handles for everything.
 *
 * The single root dispatcher is registered with the browser's own
 * addEventListener — that is the one and only place it appears, and it is an
 * implementation detail users of the framework never touch.
 */

// nodeId -> { eventType: handler }
const handlers = new Map();
// eventType -> true, so we only install one root dispatcher per type
const installed = new Map();
// custom application bus: name -> Set<fn>
const bus = new Map();

let nextId = 1;
const ID = "__mfId";

/** Events that do not bubble: the root dispatcher listens in the capture phase. */
const NON_BUBBLING = new Set([
  "focus", "blur", "scroll", "load", "error", "abort",
  "mouseenter", "mouseleave", "pointerenter", "pointerleave",
]);

const typeCache = new Map();

/** Normalises `onClick` / `onclick` / `on-click` / `click` to `click`. */
export function normalizeType(name) {
  const raw = String(name);
  const cached = typeCache.get(raw);
  if (cached !== undefined) return cached;

  let type;
  if (/^on[-A-Z]/.test(raw)) {
    // onClick, on-click — unambiguous, the prefix is always a prefix.
    type = raw.slice(2).replace(/^-/, "").toLowerCase();
  } else if (/^on[a-z]/.test(raw)) {
    // onclick vs. online: both start with "on", but only one is a prefix.
    // The browser exposes a handler property for every real event
    // ("onclick" in window) and never for a bare event name ("online" in
    // window is false — the property is "ononline").
    const stripped = raw.slice(2).toLowerCase();
    const isPrefixed = typeof window === "undefined" || `on${stripped}` in window;
    type = isPrefixed ? stripped : raw.toLowerCase();
  } else {
    type = raw.toLowerCase();
  }

  typeCache.set(raw, type);
  return type;
}

function idOf(element, create) {
  if (element[ID]) return element[ID];
  if (!create) return null;
  const id = nextId++;
  Object.defineProperty(element, ID, { value: id, enumerable: false, configurable: true });
  return id;
}

function ensureDispatcher(type) {
  if (installed.has(type)) return;
  const capture = NON_BUBBLING.has(type);
  const listener = (event) => dispatch(event, type);
  document.addEventListener(type, listener, capture);
  installed.set(type, { listener, capture });
}

function dispatch(event, type) {
  let node = event.target;
  let stopped = false;

  // Let handlers stop the framework's own walk, mirroring DOM semantics.
  const nativeStop = event.stopPropagation.bind(event);
  event.stopPropagation = () => { stopped = true; nativeStop(); };
  const nativeStopImmediate = event.stopImmediatePropagation.bind(event);
  event.stopImmediatePropagation = () => { stopped = true; nativeStopImmediate(); };

  while (node && node.nodeType) {
    const id = node[ID];
    if (id) {
      const map = handlers.get(id);
      const fn = map && map[type];
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
  const normalized = normalizeType(type);
  const id = idOf(element, true);
  let map = handlers.get(id);
  if (!map) handlers.set(id, (map = {}));
  map[normalized] = handler;
  ensureDispatcher(normalized);
}

/** Remove one handler from a rendered element. */
export function removeHandler(element, type) {
  const id = idOf(element, false);
  if (!id) return;
  const map = handlers.get(id);
  if (!map) return;
  delete map[normalizeType(type)];
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
 * Imperative binding for things outside the rendered tree — window scroll,
 * document keydown, a third-party node. Returns an `off()` function.
 *
 *   const off = on(window, "scroll", () => ...)
 */
export function on(target, type, handler) {
  if (typeof target === "string") { handler = type; type = target; target = document; }
  const normalized = normalizeType(type);

  if (target && target.nodeType === 1) {
    attachHandler(target, normalized, handler);
    return () => removeHandler(target, normalized);
  }

  // window / document / anything else: bind directly and hand back a remover.
  const capture = NON_BUBBLING.has(normalized);
  target.addEventListener(normalized, handler, capture);
  return () => target.removeEventListener(normalized, handler, capture);
}

/** Same as `on`, but the handler runs at most once. */
export function once(target, type, handler) {
  const off = on(target, type, (event, node) => { off(); handler(event, node); });
  return off;
}

/** Alias of the `off()` returned by `on`, for symmetry. */
export function off(disposer) {
  if (typeof disposer === "function") disposer();
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
    if (!allowInInput && isTypingTarget(event.target) && !need.ctrl && !need.meta) return;
    if (event.ctrlKey !== need.ctrl) return;
    if (event.metaKey !== need.meta) return;
    if (event.altKey !== need.alt) return;
    if (need.shift && !event.shiftKey) return;
    const pressed = String(event.key || "").toLowerCase();
    if (pressed !== key && String(event.code || "").toLowerCase() !== key) return;
    handler(event);
  });
}

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

/* ── Application event bus ───────────────────────────────────────────────────
   Custom, non-DOM events. Any part of the app can announce something and any
   other part can listen, with no element in between. */

export function subscribe(name, handler) {
  let set = bus.get(name);
  if (!set) bus.set(name, (set = new Set()));
  set.add(handler);
  return () => set.delete(handler);
}

export function emit(name, detail) {
  const set = bus.get(name);
  if (!set) return;
  for (const handler of Array.from(set)) handler(detail);
}

/** Test/teardown helper: forget every handler, dispatcher and bus entry. */
export function resetEvents() {
  handlers.clear();
  typeCache.clear();
  bus.clear();
  for (const [type, { listener, capture }] of installed) {
    document.removeEventListener(type, listener, capture);
  }
  installed.clear();
}

export const __internals = { handlers, installed, bus };
