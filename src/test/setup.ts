import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's auto-cleanup relies on global afterEach, which vitest only exposes
// with `globals: true`. Register it explicitly so tests don't leak DOM.
afterEach(() => {
  cleanup();
});
