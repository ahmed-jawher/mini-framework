# mini-framework — Documentation

A small, dependency-free front-end framework written from scratch in plain ES
modules. It gives you four things that work together: a **virtual DOM**, a
**custom event system**, a **state store**, and a **router**.

No build step, no npm dependencies, no React/Vue/Angular anywhere in it — about
950 lines of JavaScript in total. Copy the `framework/` folder into a project,
import from `framework/index.js`, and serve the folder over HTTP (browsers block
ES modules on `file://`).

```js
import { createApp, Component, h } from "./framework/index.js";
```

---

## Table of contents

1. [Features overview](#1-features-overview)
2. [Getting started](#2-getting-started)
3. [Creating an element](#3-creating-an-element)
4. [Adding attributes to an element](#4-adding-attributes-to-an-element)
5. [Nesting elements](#5-nesting-elements)
6. [Creating an event](#6-creating-an-event)
7. [State management](#7-state-management)
8. [Routing](#8-routing)
9. [Components and lifecycle](#9-components-and-lifecycle)
10. [Element refs](#10-element-refs)
11. [How the framework works](#11-how-the-framework-works)
12. [API reference](#12-api-reference)

---

## 1. Features overview

| Feature | What it does | Where it lives |
|---|---|---|
| **DOM abstraction (virtual DOM)** | Describe the page as plain JavaScript objects with `createElement` / `h`. The framework mounts that description into real DOM and, on every update, diffs the new description against the old one and touches only the nodes that actually changed. Children with a `key` are matched by identity, so reordering a list moves existing nodes instead of rebuilding them. | `framework/vdom.js` |
| **Event handling** | A declarative `onClick`-style attribute system that never calls `addEventListener` on your elements. Handlers are stored in a registry and delivered by a *single* root dispatcher per event type. Covers clicks, input, scrolling, and key combos (`onKey("ctrl+s", fn)`) — the last of which the DOM has no equivalent for. | `framework/events.js` |
| **State management** | One immutable store for the whole app, reachable from every route: `get` / `set`, `setState` to merge several keys at once, `subscribe` to react to changes, and `persist` to mirror state into `localStorage`. | `framework/state.js` |
| **Routing** | URL ↔ state synchronisation using hash URLs (`#/active`), so the app runs from any static file server with no configuration. Patterns support named parameters (`/todos/:id`). Back and forward buttons work. | `framework/router.js` |
| **Components** | A `Component` base class with `onMount` / `onUpdate` / `onUnmount`, local state, automatic cleanup registration, and access to the shared store and router. | `framework/component.js` |
| **App wiring** | `createApp()` connects store + router + renderer. State changes and route changes both schedule a render, so many writes in one tick produce exactly one DOM update. | `framework/app.js` |

**Design principle — inversion of control.** You never call `render()` yourself
and you never touch the DOM. You change data; the framework decides what the
screen should look like and when to repaint it. That is what makes this a
framework rather than a DOM library.

---

## 2. Getting started

The folder you are given runs as-is: `npm start`, then open the printed URL
(`http://localhost:3000/`). To build your own app, replace `index.html` and add
your own script.

**`index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>My app</title></head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`**

```js
import { createApp, Component, h } from "./framework/index.js";

const app = createApp({
  root: "#app",          // CSS selector or an element
  state: { count: 0 },   // initial application state
});

class Counter extends Component {
  render() {
    const count = this.getState("count", 0);
    return h("main", { class: "counter" }, [
      h("h1", {}, [`Count: ${count}`]),
      h("button", { onClick: () => this.setGlobalState("count", n => n + 1) }, ["+1"]),
    ]);
  }
}

app.route("/", Counter);
app.start();
```

That is the whole contract: describe the page, register a route, call `start()`.

---

## 3. Creating an element

Elements are **plain objects**, not DOM nodes. `createElement` (aliased as `h`)
builds one:

```js
import { createElement, h } from "./framework/index.js";

createElement("h1", {}, ["Hello world"]);
```

That call returns:

```js
{
  tag: "h1",
  attrs: {},
  children: [ { tag: "#text", text: "Hello world", ... } ],
  key: null,
  el: null            // filled in with the real DOM node once mounted
}
```

### Signature

```js
createElement(tag, attrs?, children?)
```

- **`tag`** — any HTML tag name as a string: `"div"`, `"li"`, `"input"`.
- **`attrs`** — optional object of attributes, event handlers, `key` and `ref`.
- **`children`** — a string, a number, a virtual node, or an (arbitrarily nested) array of them.

`attrs` may be omitted entirely — if the second argument is an array, a string
or a number, it is treated as the children:

```js
h("p", ["Just text"]);        // same as h("p", {}, ["Just text"])
h("p", "Just text");          // same again
h("h1", {}, ["Hello"]);       // explicit form
h("br");                      // no attributes, no children
```

Children are normalised for you: `null`, `undefined`, `true` and `false` are
dropped (so `condition && h(...)` is safe), nested arrays are flattened, and
strings and numbers become text nodes.

```js
h("ul", { class: "list" }, items.map(item => h("li", {}, [item.title])));
```

### Seeing the object structure

`toJSON` prints the tree as the plain JSON structure the framework works with:

```js
import { h, toJSON } from "./framework/index.js";

console.log(toJSON(
  h("div", { class: "nameSubm" }, [
    h("input", { type: "text", placeholder: "Insert Name" }),
    h("input", { type: "submit", placeholder: "Submit" }),
  ])
));
```

```json
{
  "tag": "div",
  "attrs": { "class": "nameSubm" },
  "children": [
    { "tag": "input", "attrs": { "type": "text", "placeholder": "Insert Name" }, "children": [] },
    { "tag": "input", "attrs": { "type": "submit", "placeholder": "Submit" }, "children": [] }
  ]
}
```

### Getting an element on screen

Inside a component you just return the node and the framework mounts it. If you
want to drive the DOM yourself, the low-level functions are exported too:

```js
import { h, render } from "./framework/index.js";

const container = document.querySelector("#app");

let mounted = render(h("div", {}, ["first"]), container);          // initial mount
mounted = render(h("div", {}, ["second"]), container, mounted);    // diff + patch
```

`render(vnode, container, oldVNode?)` returns the tree that is now on screen —
pass it back as `oldVNode` next time so the framework can diff instead of
rebuilding.

---

## 4. Adding attributes to an element

Attributes go in the second argument as a plain object. The framework decides
for each one whether it should become an HTML attribute, a DOM property, an
event handler, a class, a key or a ref.

```js
h("input", {
  type: "text",
  class: "new-todo",
  placeholder: "What needs to be done?",
  value: draft,               // written as a live DOM property
  autofocus: true,            // boolean attribute
  "data-testid": "new-todo",  // any custom / aria / data attribute
});
```

### The rules

| Kind | Example | Behaviour |
|---|---|---|
| Plain attributes | `id`, `href`, `type`, `placeholder`, `style`, `aria-label`, `data-*` | `setAttribute(name, String(value))`. `null` / `undefined` removes the attribute. |
| **Boolean values** | `disabled: true`, `hidden: false`, `autofocus: true` | `true` adds the bare attribute, `false` removes it — never `disabled="false"`, which a browser reads as *disabled*. |
| **`value` and `checked`** | `value: draft`, `checked: todo.completed` | Written as live DOM *properties* (and `checked` is also mirrored as an attribute so CSS selectors keep working). |
| **`class` / `className`** | see below | A string, or an object whose truthy keys become class names. |
| **Event handlers** | `onClick`, `onInput`, `onBlur` | See [Creating an event](#6-creating-an-event). |
| **`key`** | `key: todo.id` | Not rendered. Used by the diff to match children across renders. |
| **`ref`** | `ref: el => el.focus()` | Not rendered. See [Element refs](#10-element-refs). |

> **Why `value` and `checked` are special.** For those two, the HTML attribute
> only sets the element's *initial* value; once the user types or clicks, the
> live DOM property is what is displayed. Writing them as attributes would make
> a controlled input appear to ignore your state, so the framework writes the
> property instead.

### Classes — two accepted forms

```js
h("li", { class: "todo completed" });                     // string

h("li", { class: { todo: true,                            // object: truthy keys win
                   completed: todo.completed,
                   editing: isEditing } });

h("a", { class: isSelected ? "selected" : null });        // null removes the attribute
```

### Styles

`style` takes a CSS string and goes through the ordinary attribute path:

```js
h("div", { style: "color: red; font-weight: bold" });
h("div", { style: `width: ${percent}%` });
```

### Keys for list children

Give siblings in a list a `key` so the diff can match them by identity instead
of by position. Without keys, deleting the first item of a list re-uses the
wrong DOM nodes and you lose input focus, checkbox state and scroll position.

```js
h("ul", { class: "todo-list" },
  todos.map(todo =>
    h("li", { key: todo.id, class: { completed: todo.completed } }, [todo.title])
  )
);
```

### Updating attributes

You never mutate attributes by hand. Return a new description and the framework
computes the difference: attributes present before but gone now are removed,
changed ones are re-applied, and unchanged ones are skipped.

---

## 5. Nesting elements

The third argument is the children list, and children are themselves elements —
so nesting is just nesting calls.

```js
const page = h("section", { class: "todoapp" }, [
  h("header", { class: "header" }, [
    h("h1", {}, ["todos"]),
    h("input", { class: "new-todo", placeholder: "What needs to be done?" }),
  ]),
  h("ul", { class: "todo-list" }, [
    h("li", { key: "1" }, [
      h("div", { class: "view" }, [
        h("input", { class: "toggle", type: "checkbox", checked: false }),
        h("label", {}, ["Buy milk"]),
        h("button", { class: "destroy" }),
      ]),
    ]),
  ]),
]);
```

produces

```html
<section class="todoapp">
  <header class="header">
    <h1>todos</h1>
    <input class="new-todo" placeholder="What needs to be done?">
  </header>
  <ul class="todo-list">
    <li>
      <div class="view">
        <input class="toggle" type="checkbox">
        <label>Buy milk</label>
        <button class="destroy"></button>
      </div>
    </li>
  </ul>
</section>
```

### Children can be anything

```js
h("div", {}, [
  "plain text",                       // string → text node
  42,                                 // number → text node
  h("span", {}, ["a node"]),          // virtual node
  items.map(i => h("li", {}, [i])),   // arrays are flattened
  isLoggedIn && h("a", {}, ["Log out"]),   // false is dropped
  user ? h("b", {}, [user.name]) : null,   // null is dropped
]);
```

### Composing with functions

Because elements are just values, you break a page apart with ordinary
functions — no special syntax needed:

```js
const TodoItem = (todo) =>
  h("li", { key: todo.id, class: { completed: todo.completed } }, [
    h("div", { class: "view" }, [
      h("input", { class: "toggle", type: "checkbox", checked: todo.completed }),
      h("label", {}, [todo.title]),
    ]),
  ]);

const TodoList = (todos) =>
  h("ul", { class: "todo-list" }, todos.map(TodoItem));
```

---

## 6. Creating an event

Events are declared as attributes named `on` + the capitalised event name.
**You never call `addEventListener` on your own elements** — the framework's
event system replaces it.

```js
h("button", { onClick: () => actions.clearCompleted() }, ["Clear completed"]);
```

The handler is called as `handler(event, element)`, with `this` bound to the
element.

### Naming

`onClick` → `click`, `onInput` → `input`, `onKeydown` → `keydown`,
`onDblclick` → `dblclick`, `onChange` → `change`, `onBlur` → `blur`,
`onScroll` → `scroll`. The rule is literally "strip `on`, lowercase the rest",
so any DOM event type works.

### Examples

```js
// Click
h("button", { onClick: (event) => console.log("clicked", event) }, ["Go"]);

// Input — a controlled field
h("input", {
  value: draft,
  onInput: (event) => store.set("draft", event.target.value),
});

// Keyboard, inline
h("input", {
  onKeydown: (event) => {
    if (event.key !== "Enter") return;
    actions.add(event.target.value);
  },
});

// Double click, blur, change — all the same shape
h("label", { onDblclick: () => actions.startEditing(todo.id) }, [todo.title]);
h("input", { onBlur: (event) => actions.save(todo.id, event.target.value) });
h("input", { type: "checkbox", onChange: (event) => actions.toggleAll(event.target.checked) });

// Scrolling
h("div", { class: "feed", onScroll: (event) => {
  const box = event.target;
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 50) loadMore();
}});

// Stopping propagation works exactly like the DOM
h("button", { onClick: (event) => { event.stopPropagation(); doThing(); } }, ["X"]);

// Handlers receive the element as the second argument, and as `this`
h("li", { onClick: (event, element) => element.classList.toggle("hot") });
```

### Key combinations — `onKey(combo, handler, options?)`

Something the raw DOM has no notion of. Returns an `off()` function.

```js
import { onKey } from "./framework/index.js";

const off = onKey("Escape", () => actions.cancelEditing(), { allowInInput: true });
onKey("ctrl+s", (event) => { event.preventDefault(); save(); });
onKey("cmd+k", openPalette);
onKey("shift+?", showHelp);

off();   // stop listening
```

Options: `target` (default `document`), `type` (default `"keydown"`), and
`allowInInput` — by default an unmodified key is ignored while the user is
typing in an `input`, `textarea`, `select` or contenteditable, so a shortcut
can't hijack typing.

### Window and document events — `on(target, type, handler)`

For things outside your rendered tree. Returns an `off()` function.

```js
import { on } from "./framework/index.js";

const stop = on(window, "scroll", () => console.log(window.scrollY));
const stop2 = on(window, "resize", () => console.log(window.innerWidth));
on("keydown", (event) => console.log(event.key));   // target defaults to document

stop();
```

Inside a component, hand the disposer to `this.onCleanup(...)` and it is
released automatically on unmount:

```js
class Page extends Component {
  onMount() {
    this.onCleanup(onKey("Escape", () => this.close()));
    this.onCleanup(on(window, "resize", () => this.setState({ w: window.innerWidth })));
  }
}
```

### How this differs from `addEventListener`

| | `addEventListener` | This framework |
|---|---|---|
| Where the handler lives | Bound to the element | In a registry keyed by an id stamped on the node — handlers are *data*, not bindings |
| Listeners installed | One per element per type | **One root dispatcher per event type**, on `document`, for the whole app |
| Re-rendering | Re-binding leaks listeners unless you remove them | The registry entry is overwritten; nothing to leak |
| Removal | Needs the exact same function reference | The virtual DOM drops the entry when the node goes away |
| Extras | — | `onKey` combos, `off()` handles, handlers that survive re-render for free |

`document.addEventListener` appears in exactly one place — installing the root
dispatcher inside `events.js`. It is an implementation detail you never touch.

---

## 7. State management

One store holds the whole application state, so different routes and components
share data without passing anything between them. State is treated as
**immutable**: every write produces a new top-level object, which makes
`oldState !== newState` a reliable "something changed" signal.

```js
const app = createApp({ root: "#app", state: { todos: [], draft: "" } });
const store = app.store;      // reachable from anywhere
```

Inside a component, `this.store` and the `getState` / `setGlobalState` helpers
point at that same store.

### Reading and writing

```js
store.get();                          // the whole state object
store.get("todos", []);               // one key, with a fallback if unset
store.getState();                     // the whole state object (same as get())

store.set("draft", "milk");
store.set("count", n => n + 1);       // function form: receives the current value

store.setState({ editingId: null, draft: "" });   // several keys, one notification
```

A write that changes nothing (`store.set("draft", "milk")` twice) is ignored, so
subscribers are not woken for free.

> Prefer `store.set("count", n => n + 1)` whenever the new value depends on the
> old one. Renders are batched, so a handler closing over a value read at render
> time can fire twice before the next paint and compute from a stale copy; the
> function form always reads what is in the store right now.

Nested data is written by rebuilding the branch you are changing, which keeps
the "new object per write" rule visible at the call site:

```js
store.set("todos", store.get("todos", []).map(todo =>
  todo.id === id ? { ...todo, completed: !todo.completed } : todo
));
```

### Subscribing

```js
const off = store.subscribe((state) => console.log(state.todos.length));
off();
```

The app itself is just another subscriber — that is how a write turns into a
repaint.

### Persistence

Mirror the store into `localStorage`; saved state is loaded immediately on
startup and shallow-merged over the initial state.

```js
store.persist("my-app", { pick: ["todos"] });   // pick keeps transient UI state out
```

Persistence is best-effort — corrupt data, quota errors and private-mode
failures are swallowed so the app still runs.

---

## 8. Routing

The router keeps the URL and the application state in sync. A route change is
just another change the app re-renders in response to.

URLs are hash-based (`#/active`), which means the app runs from any static file
server with no rewrite rules.

```js
const app = createApp({ root: "#app" });

app.route("/", TodoList);
app.route("/active", TodoList);
app.route("/completed", TodoList);
app.route("/todos/:id", TodoDetail);
app.start();
```

If no route matches, a built-in 404 component renders instead of a blank page.

### Patterns

| Pattern | Matches | `context.params` |
|---|---|---|
| `/` | `#/` | `{}` |
| `/active` | `#/active` | `{}` |
| `/todos/:id` | `#/todos/42` | `{ id: "42" }` |
| `/users/:user/posts/:post` | `#/users/ada/posts/7` | `{ user: "ada", post: "7" }` |

### The route context

Every component receives a `context` describing the current location:

```js
{
  route:  "/todos/:id",          // the pattern that matched, or null for a 404
  path:   "/todos/42",           // the actual path
  params: { id: "42" },          // named parameters, URI-decoded
  router: Router,
}
```

```js
class TodoDetail extends Component {
  render() {
    return h("h1", {}, [`Todo ${this.context.params.id}`]);
  }
}
```

### Navigating

```js
this.navigate("/active");                        // from inside a component
app.router.navigate("/active", { replace: true });   // no new history entry

// The correct href for a link:
h("a", { href: app.router.href("/active") }, ["Active"]);   // → "#/active"
```

Back and forward buttons work because the router listens for `hashchange`, not
only for its own `navigate()` calls.

---

## 9. Components and lifecycle

A component owns a piece of the screen. You implement `render()` and return a
virtual node — **you never call `render()` yourself**.

```js
import { Component, h, onKey } from "./framework/index.js";

class TodoApp extends Component {
  onMount() {
    // Runs once, after the markup is in the document.
    this.onCleanup(onKey("Escape", () => this.cancel()));
    // Anything returned from onMount that is a function is also treated
    // as a cleanup:
    // return () => clearInterval(timer);
  }

  onUpdate() { /* after every subsequent re-render */ }
  onUnmount() { /* when the route moves away */ }

  render() {
    const todos = this.getState("todos", []);
    return h("section", { class: "todoapp" }, [
      h("h1", {}, [`${todos.length} todos`]),
      h("button", { onClick: () => this.setState({ open: !this.state.open }) }, ["Toggle"]),
    ]);
  }
}
```

### What a component gives you

| Member | Description |
|---|---|
| `this.app` | The `App` instance |
| `this.store` / `this.router` | The shared store and router |
| `this.context` | Current route context (`route`, `path`, `params`) |
| `this.state` | Component-local state (UI details no other route cares about) |
| `this.setState(patch)` | Merge into local state and request a re-render |
| `this.getState(key, fallback)` | Read from the shared store |
| `this.setGlobalState(key, value)` | Write to the shared store |
| `this.onCleanup(fn)` | Register a teardown to run on unmount |
| `this.navigate(path, options)` | Route elsewhere |

One instance is kept per route, so both kinds of state survive re-renders of the
same route. Registering the same class on several routes (as TodoMVC does for
its three filters) gives one instance per route.

If `render()` throws, the framework catches it and paints the stack trace
instead of leaving a blank page with an error only in the console.

---

## 10. Element refs

Sometimes you need the real DOM node — to focus an input, measure a box, or call
`select()`. Pass a function as `ref`; it is called with the element.

```js
h("input", { class: "edit", ref: (el) => { el.focus(); el.select(); } });
```

Refs are deliberately deferred to a microtask: a node being mounted is not in the
document yet, so `el.focus()` during mount would silently do nothing. Because the
ref runs on every render, guard it if repeated calls would be disruptive:

```js
h("input", {
  ref: (input) => {
    if (document.activeElement === input) return;   // don't yank the caret back
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  },
});
```

---

## 11. How the framework works

### The big picture

```
        you write                       the framework does
  ───────────────────────      ────────────────────────────────────────
   store.set("todos", …)  ──▶  Store commits a new immutable state
                               and notifies subscribers
                                        │
                                        ▼
   (or the URL changes)   ──▶  Router resolves the path into a context
                                        │
                                        ▼
                               App.requestRender() schedules ONE render
                               on the next animation frame
                                        │
                                        ▼
                               component.render() → a tree of plain objects
                                        │
                                        ▼
                               vdom.patch(oldTree, newTree)
                               → only the changed DOM nodes are touched
                                        │
                                        ▼
                               lifecycle hooks + deferred ref callbacks
```

### 1. The DOM abstraction

A page is described as plain objects:

```js
{ tag: "div", attrs: { class: "todoapp" }, children: [ … ], key: null, el: null }
```

Building that tree is cheap — it is just objects — and it can be compared with
the previous tree before anything is written to the document.

- **`mount(vnode)`** turns a description into real DOM: create the element, apply
  each attribute through the attribute/property/event/class/ref dispatcher,
  mount the children recursively, and store the resulting node on `vnode.el`.
- **`patch(parent, oldVNode, newVNode, index)`** applies the *difference*. If a
  node was added it is mounted; if removed, its handlers are detached and it is
  dropped; if the tag or key changed it is replaced wholesale; otherwise it is
  patched in place.
- **`patchNode`** diffs attributes (removing what disappeared, re-applying what
  changed, skipping what is identical) and then the children.

**Why writing to the DOM is the expensive part.** Reading and writing real DOM
nodes forces layout and style recalculation; comparing two JavaScript objects
does not. Describing the whole page on every change and then applying only the
delta gives you the simplicity of "redraw everything" with the cost of "change
what moved".

**One child algorithm, two behaviours.** Old children are indexed by `k:<key>` if
they have a key and by `i:<index>` if they do not. Each new child claims its
match and is patched in place, unclaimed old nodes are removed, and the
survivors are re-ordered with `insertBefore`. So an unkeyed list is diffed
positionally, and a keyed list survives reordering and deletion — which is why
removing the first item of a list does not blow away the DOM of every item after
it, and why input focus and checkbox state survive a render.

**Why the diff skips some attributes but not others.** Identical primitive values
are skipped, but `value` and `checked` are always re-applied (the user may have
typed since the last render, so the DOM property can differ from both trees) and
so are handlers (an inline arrow function has a new identity every render).

### 2. The event system

Instead of binding a listener to each element, the framework keeps a registry:

```
node id  ──▶  { click: fn, input: fn, … }
```

Every rendered node that carries a handler gets a non-enumerable id stamped on
it. The first time any element in the app needs a `click` handler, **one**
dispatcher is registered on `document` for `click`. When an event fires, that
dispatcher walks from `event.target` up through the ancestors, looks up each
node's id in the registry, and calls whatever it finds — re-implementing bubbling
itself, so that `event.stopPropagation()` stops the framework's walk too. Events
that do not bubble (`focus`, `blur`, `scroll`, `mouseenter`, `mouseleave`) are
listened for in the capture phase and dispatched only to their target.

Three consequences fall out of this design:

1. **No listener leaks.** Re-rendering overwrites a registry entry rather than
   adding a second listener, which matters because inline arrow functions have a
   new identity on every render. When a node is removed, `detachHandlers` drops
   its whole subtree from the registry.
2. **Constant listener count.** An app with 10,000 clickable rows installs one
   `click` listener, not 10,000.
3. **Handlers are data.** Because they are looked up rather than bound, the
   system can add things the DOM has no concept of — such as `onKey` combos with
   modifier matching and a "don't hijack typing" rule.

### 3. State management

The `Store` holds one object and never mutates it. `set(key, value)` builds a new
top-level object with the spread operator, leaving every untouched branch shared
by reference. That makes change detection a `!==` comparison, and it means a
subscriber can safely hold on to an old state object and compare it later.

A write that produces the same value short-circuits before notifying, so no
render is scheduled for a no-op. Subscribers are copied into an array before
being called, so a listener may unsubscribe itself mid-notification without
skipping its neighbours.

### 4. Routing

`Router` compiles each pattern into a regular expression once, extracting the
parameter names: `:id` becomes `([^/]+)`. Resolving means reading the current
path from `location.hash`, normalising it (`"#/active/"`, `"active"` and
`"/active"` are all the same route), testing it against each route in
registration order, and producing a context object with decoded `params`.
Navigation uses `history.pushState` / `replaceState` and then re-resolves;
browser back and forward work because the router also listens for `hashchange`.

### 5. Putting it together

`App` is the glue. In its constructor it subscribes to both the store and the
router. A store change calls `requestRender()`, which schedules a render on the
next animation frame and ignores further requests until that frame runs — so ten
writes in one tick produce exactly one DOM update. A route change renders
synchronously, so navigation feels immediate.

`renderNow()` then:

1. Takes the current route context from the router.
2. Finds or creates the component instance for that route — one instance per
   route, so component state survives re-renders.
3. Unmounts the outgoing component if the route changed, running its cleanups.
4. Calls `component.render()`, catching exceptions and painting the stack trace
   rather than leaving a blank page.
5. Diffs the returned tree against `this.oldTree` and patches the DOM.
6. Calls `onMount()` for a newly mounted component, or `onUpdate()` otherwise.

That loop is the inversion of control this framework is built around: **your code
changes data; the framework decides what to draw and when.**

---

## 12. API reference

Everything is re-exported from `framework/index.js`.

### App

| Export | Description |
|---|---|
| `createApp({ root, state })` | Create an app. `root` is a selector or element; `state` is the initial store. |
| `app.route(path, ComponentClass)` | Register a route. |
| `app.start()` | Start routing and render the first page. |
| `app.getState(key, fallback)` / `app.setState(key, value)` | Store passthrough. |
| `app.requestRender()` / `app.renderNow()` | Schedule a render / render synchronously. |
| `app.store` / `app.router` | The underlying `Store` and `Router`. |

### Virtual DOM

| Export | Description |
|---|---|
| `createElement(tag, attrs?, children?)`, `h` | Create a virtual node. |
| `createTextNode(value)` | Create a text node explicitly. |
| `isVNode(value)` | Type check. |
| `mount(vnode)` | Build real DOM from a description. |
| `patch(parent, oldVNode, newVNode, index?)` | Apply the difference between two trees. |
| `patchNode(element, oldVNode, newVNode)` | Patch a known element in place. |
| `render(vnode, container, oldVNode?)` | Mount or update a whole tree; returns the tree now on screen. |
| `toJSON(vnode)` | Plain-JSON view of a tree, for debugging. |
| `TEXT` | The text-node tag sentinel (`"#text"`). |

### Events

| Export | Description |
|---|---|
| `on(target, type, handler)` | Bind to `window` / `document`; returns `off()`. `target` may be omitted (defaults to `document`). |
| `onKey(combo, handler, options?)` | Key combos (`"Escape"`, `"ctrl+s"`, `"shift+?"`); returns `off()`. |

Element handlers are declared as `onClick`-style attributes, not through these
functions.

### State

| Export | Description |
|---|---|
| `createStore(initialState)`, `Store` | Create a store. |
| `store.get(key?, fallback?)` / `store.getState()` | Read. |
| `store.set(key, value \| fn)` | Immutable write. |
| `store.setState(patch)` | Merge several keys in one notification. |
| `store.subscribe(fn)` | Subscribe to every change; returns an unsubscribe. |
| `store.persist(key, { pick })` | Mirror into `localStorage`. |

### Router

| Export | Description |
|---|---|
| `createRouter()`, `Router` | Create a router. |
| `router.add(pattern)` | Register a pattern. |
| `router.onChange(fn)` | Called after every resolved navigation; returns an unsubscribe. |
| `router.start()` | Begin listening and resolve the current URL. |
| `router.getPath()` / `router.href(path)` | Current path / the href a link should use. |
| `router.navigate(path, { replace })` | Navigate. |
| `router.match(path)` | Match without navigating. |

### Components

| Export | Description |
|---|---|
| `Component` | Base class: `render`, `onMount`, `onUpdate`, `onUnmount`, `setState`, `getState`, `setGlobalState`, `onCleanup`, `navigate`. |
| `NotFoundComponent` | Default 404 page. |

---

## Worked example

A complete TodoMVC app built with this framework lives in `todomvc/` and
exercises every feature described here: the virtual DOM with keyed lists, routed
filters (`#/`, `#/active`, `#/completed`), one shared persisted store, and the
custom event system — with no `addEventListener` anywhere in the application
code. Run it with `npm start`.
