/**
 * refs.js — element reference registry.
 *
 * The old implementation reached for a global `app` imported from the demo
 * project, which made the framework unusable outside that one folder. Refs now
 * live in their own module so nothing in the framework imports application code.
 */

const refs = new Map();

export function setRef(name, element) {
  refs.set(name, element);
}

export function getRef(name) {
  return refs.get(name) || null;
}

export function clearRef(name) {
  refs.delete(name);
}

export function clearRefs() {
  refs.clear();
}

/** Drop any ref whose element is no longer attached to the document. */
export function pruneRefs() {
  for (const [name, el] of refs) {
    if (el && el.isConnected === false) refs.delete(name);
  }
}
