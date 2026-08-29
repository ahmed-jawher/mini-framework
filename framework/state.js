/**
 * state.js — state management.
 *
 * One store holds the whole application state. Any part of the app can read
 * it, write it, and subscribe to it, so several routes can share the same data
 * without passing anything between them. Writes are announced to subscribers;
 * the app subscribes once and re-renders, which is the inversion of control
 * that makes this a framework rather than a library: you change data, the
 * framework decides what the screen should look like.
 *
 * State is treated as immutable — every write produces a new top-level object,
 * so `oldState !== newState` is a reliable "something changed" signal and
 * subscribers can diff slices cheaply.
 */

export class Store {
  constructor(initialState = {}) {
    this._state = { ...initialState };
    this._subscribers = new Set();
    this._depth = 0;         // batch nesting
    this._pending = false;   // a notify is owed once the batch unwinds
    this._previous = this._state;
    this._batchOrigin = undefined; // state as it was before the outermost batch began
  }

  /** The whole state object (treat as read-only). */
  getState() {
    return this._state;
  }

  /**
   * get("todos") or get("user.profile.name") with an optional fallback.
   * Called with no arguments it returns the whole state.
   */
  get(path, fallback) {
    if (path === undefined) return this._state;
    const value = readPath(this._state, path);
    return value === undefined ? fallback : value;
  }

  /**
   * set("filter", "active") or set("user.profile.name", "Ada").
   *
   * `value` may also be a function, which receives the current value at that
   * path and returns the new one:
   *
   *   store.set("count", n => n + 1)
   *
   * Prefer that form whenever the new value depends on the old one. Renders
   * are batched, so a handler closing over a value read at render time can
   * fire twice before the next render and compute from a stale copy; the
   * function form always sees what is in the store right now. (If you ever
   * need to store an actual function in state, use `update()` instead.)
   */
  set(path, value) {
    const resolved = typeof value === "function"
      ? value(readPath(this._state, path))
      : value;
    const next = writePath(this._state, path, resolved);
    if (next === this._state) return this._state;
    return this._commit(next);
  }

  /**
   * Merge an object (or the result of a function) into the top level.
   *   store.setState({ filter: "all" })
   *   store.setState(s => ({ count: s.count + 1 }))
   */
  setState(patch) {
    const partial = typeof patch === "function" ? patch(this._state) : patch;
    if (!partial) return this._state;
    let changed = false;
    for (const key of Object.keys(partial)) {
      if (this._state[key] !== partial[key]) { changed = true; break; }
    }
    if (!changed) return this._state;
    return this._commit({ ...this._state, ...partial });
  }

  /** Replace the state wholesale with the return value of `fn(state)`. */
  update(fn) {
    const next = fn(this._state);
    if (!next || next === this._state) return this._state;
    return this._commit(next);
  }

  /** Reset back to a given state (or `{}`). */
  reset(state = {}) {
    return this._commit({ ...state });
  }

  /**
   * subscribe(listener) — listener(newState, oldState). Returns an
   * unsubscribe function; call it in `onUnmount` to avoid leaks.
   */
  subscribe(listener) {
    this._subscribers.add(listener);
    return () => this._subscribers.delete(listener);
  }

  /**
   * select(path, listener) — only fires when that slice actually changes.
   *   store.select("todos", todos => console.log(todos.length))
   */
  select(path, listener) {
    let current = readPath(this._state, path);
    return this.subscribe((next) => {
      const value = readPath(next, path);
      if (value !== current) {
        const previous = current;
        current = value;
        listener(value, previous);
      }
    });
  }

  /**
   * Group several writes into one notification:
   *   store.batch(() => { store.set("a", 1); store.set("b", 2); });
   *
   * Nested batches collapse into the outermost one, and the single
   * notification fired at the end reports (state, oldState) where oldState
   * is whatever the state was *before the whole batch started* — not the
   * intermediate value from the second-to-last write inside it. If `fn`
   * throws, the writes already made stay committed (state is never rolled
   * back) and subscribers are still notified about them before the error
   * propagates out of `batch()`.
   */
  batch(fn) {
    if (this._depth === 0) this._batchOrigin = this._state;
    this._depth++;
    try {
      fn(this);
    } finally {
      this._depth--;
      if (this._depth === 0) {
        if (this._pending) {
          this._pending = false;
          this._previous = this._batchOrigin;
          this._notify();
        }
        this._batchOrigin = undefined;
      }
    }
    return this._state;
  }

  /**
   * Mirror the store into localStorage under `key`. Existing saved state is
   * loaded immediately (shallow-merged over the current state).
   *   store.persist("todos-mf", { pick: ["todos"] })
   */
  persist(key, { pick = null } = {}) {
    let saved = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch (_) { /* corrupt or unavailable storage: start fresh */ }

    if (saved && typeof saved === "object") {
      this._state = { ...this._state, ...saved };
      this._previous = this._state;
    }

    const save = (state) => {
      try {
        const payload = pick
          ? pick.reduce((acc, k) => (acc[k] = state[k], acc), {})
          : state;
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (_) { /* quota or private mode: persistence is best-effort */ }
    };

    save(this._state);
    return this.subscribe(save);
  }

  _commit(next) {
    // Inside a batch, `_previous` is set once (to `_batchOrigin`) when the
    // batch unwinds, so intermediate writes here must not clobber it with
    // the second-to-last state.
    if (this._depth === 0) this._previous = this._state;
    this._state = next;
    if (this._depth > 0) { this._pending = true; return next; }
    this._notify();
    return next;
  }

  _notify() {
    const state = this._state;
    const previous = this._previous;
    for (const listener of Array.from(this._subscribers)) {
      listener(state, previous);
    }
  }
}

export function createStore(initialState) {
  return new Store(initialState);
}

/* ── path helpers ───────────────────────────────────────────────────────── */

function segments(path) {
  return Array.isArray(path) ? path : String(path).split(".");
}

function readPath(object, path) {
  let current = object;
  for (const key of segments(path)) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

/** Immutable write: clones only the objects along the path. */
function writePath(object, path, value) {
  const keys = segments(path);
  const walk = (node, depth) => {
    const key = keys[depth];
    const isLast = depth === keys.length - 1;
    const base = node === null || node === undefined
      ? (isNaN(Number(key)) ? {} : [])
      : node;
    const currentValue = base[key];
    const nextValue = isLast ? value : walk(currentValue, depth + 1);
    if (currentValue === nextValue && base === node) return node;
    if (Array.isArray(base)) {
      const copy = base.slice();
      copy[key] = nextValue;
      return copy;
    }
    return { ...base, [key]: nextValue };
  };
  return walk(object, 0);
}
