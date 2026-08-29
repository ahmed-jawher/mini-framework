# mini-framework

A dependency-free front-end framework, built from scratch: a DOM
abstraction (virtual DOM), a router, a state store, and a custom event
system — no React/Vue/Angular/etc. anywhere in it. Includes a full
[TodoMVC](https://todomvc.com/) app, in `todomvc/`, built with it.

## Project structure

```
mini-framework-main/
├── framework/      # the framework — copy this folder into any project that wants it
│   ├── index.js    #   public entry point: everything is exported from here
│   ├── vdom.js     #   DOM abstraction: createElement, mount, keyed diff/patch
│   ├── events.js   #   event system: handler registry + root dispatcher
│   ├── state.js    #   state management: the Store
│   ├── router.js   #   routing: hash and history modes
│   ├── app.js      #   wiring: store + router + renderer
│   ├── component.js#   the Component base class and lifecycle
│   └── refs.js     #   element reference registry
├── todomvc/        # a full application built with the framework
├── index.html      # loads todomvc/main.js
└── serve.js        # zero-dependency static file server
```

Where each requirement lives:

| Requirement | Implementation |
|---|---|
| Abstracting the DOM | `framework/vdom.js` |
| Routing System | `framework/router.js` |
| State Management | `framework/state.js` |
| Event Handling | `framework/events.js` |
| The four working together | `framework/app.js` |

## Running the TodoMVC demo

The framework uses ES modules, which browsers block over `file://`, so it
needs to be served over HTTP:

```bash
npm start
```

Then open the URL it prints (`http://localhost:3000/` by default). Routing
uses hash URLs (`#/active`, `#/completed`) by default, which need no server
configuration — any other static file server works too (`npx http-server .`,
`python3 -m http.server`, etc.).

## Using the framework in a new project

Copy the `framework/` folder into your project and import from its single
entry point:

```js
import { createApp, Component, h } from "./framework/index.js";
```

Every module carries its own explanatory comments; `todomvc/` is a full
worked example that exercises every feature.
