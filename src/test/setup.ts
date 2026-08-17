import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";
import { generateKeyPairSync, webcrypto } from "node:crypto";

// RTL's auto-cleanup relies on global afterEach, which vitest only exposes
// with `globals: true`. Register it explicitly so tests don't leak DOM.
afterEach(() => {
  cleanup();
});

// jsdom's crypto only implements getRandomValues — jose (used by Convex Auth
// to sign JWTs) needs WebCrypto `subtle`. Node's webcrypto covers both, so
// swap it in when the global lacks `subtle`.
if (typeof globalThis.crypto?.subtle === "undefined") {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

// The Convex Auth library signs JWTs with an RS256 private key and an issuer
// from `CONVEX_SITE_URL` (both injected by the platform in production, absent
// in tests). Mint an ephemeral key once so password/OTP sign-in flows can be
// exercised end-to-end in the test backend.
beforeAll(() => {
  if (!process.env.JWT_PRIVATE_KEY) {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    process.env.JWT_PRIVATE_KEY = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
  }
  if (!process.env.CONVEX_SITE_URL) {
    process.env.CONVEX_SITE_URL = "https://vcollab-test.convex.cloud";
  }
  if (!process.env.SITE_URL) {
    process.env.SITE_URL = "https://vcollab-test.convex.cloud";
  }
});

// jsdom doesn't implement scrollIntoView, but components that auto-scroll
// (e.g. the meeting chat) call it in effects. Stub it so tests don't throw.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement the Pointer Capture API, but Radix Select calls
// target.hasPointerCapture on pointerdown and throws if it's missing — which
// prevents the dropdown from opening in tests. Stub it like the other jsdom
// gaps above.
if (typeof Element !== "undefined" && typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

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
if (typeof document !== "undefined" && typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}
