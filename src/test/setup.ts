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
