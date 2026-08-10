import { convexTest } from "convex-test";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Create a fresh in-memory Convex backend for a test.
 *
 * `convex.json` uses a custom functions path (`src/convex/`), so the module
 * map must be supplied explicitly via `import.meta.glob`.
 */
export function makeTestClient() {
  return convexTest({
    schema,
    modules: import.meta.glob("../convex/**/*.*s"),
  });
}

export type TestClient = ReturnType<typeof makeTestClient>;

/** Insert a user document and return its id (usable as an auth `subject`). */
export async function insertUser(
  t: TestClient,
  email: string,
  name = "Test User",
): Promise<Id<"users">> {
  return t.run((ctx) => ctx.db.insert("users", { name, email, isAnonymous: false }));
}
