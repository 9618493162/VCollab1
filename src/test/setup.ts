import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's auto-cleanup relies on global afterEach, which vitest only exposes
// with `globals: true`. Register it explicitly so tests don't leak DOM.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollIntoView, but components that auto-scroll
// (e.g. the meeting chat) call it in effects. Stub it so tests don't throw.
Element.prototype.scrollIntoView = () => {};

// jsdom doesn't implement IntersectionObserver, but framer-motion's
// whileInView features construct one on mount (e.g. the Landing page).
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// input-otp (used by the auth page's code input) measures itself with a
// ResizeObserver, which jsdom doesn't implement either.
class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// input-otp's caret timer calls elementFromPoint, which jsdom doesn't
// implement. Stub it so that timer never throws.
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}
