import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient } from "./convex-test-client";

describe("settings", () => {
  it("returns defaults for anonymous users", async () => {
    const t = makeTestClient();
    const settings = await t.query(api.settings.getSettings);
    expect(settings).toEqual({
      notifyReminders: true,
      notifyInvites: true,
      notifySummaries: true,
      notifyCollaboration: true,
      language: "en",
      timezone: "UTC",
      joinWithMic: true,
      joinWithCam: true,
    });
  });

  it("requires auth to update settings", async () => {
    const t = makeTestClient();
    await expect(
      t.mutation(api.settings.updateSettings, { language: "hi" }),
    ).rejects.toThrow("Sign in to update settings");
  });

  it("persists partial preference updates per user", async () => {
    const t = makeTestClient();
    const userId = await insertUser(t, "alice@example.com", "Alice");
    const alice = t.withIdentity({ subject: userId });

    await alice.mutation(api.settings.updateSettings, {
      language: "hi",
      timezone: "Asia/Kolkata",
      joinWithMic: false,
    });

    const settings = await alice.query(api.settings.getSettings);
    expect(settings.language).toBe("hi");
    expect(settings.timezone).toBe("Asia/Kolkata");
    expect(settings.joinWithMic).toBe(false);
    // untouched prefs keep their defaults
    expect(settings.notifyReminders).toBe(true);
    expect(settings.joinWithCam).toBe(true);

    // another user is unaffected
    const otherId = await insertUser(t, "bob@example.com", "Bob");
    const bob = t.withIdentity({ subject: otherId });
    expect((await bob.query(api.settings.getSettings)).language).toBe("en");
  });

  it("cleans profile names and rejects non-URL images", async () => {
    const t = makeTestClient();
    const userId = await insertUser(t, "alice@example.com", "Alice");
    const alice = t.withIdentity({ subject: userId });

    await expect(
      alice.mutation(api.settings.updateProfile, {
        name: "  Alice   Wonder  ",
        image: "not-a-url",
      }),
    ).rejects.toThrow("Profile image must be a URL");

    await alice.mutation(api.settings.updateProfile, {
      name: "  Alice   Wonder  ",
      image: "https://example.com/avatar.png",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.name).toBe("Alice Wonder");
    expect(user?.image).toBe("https://example.com/avatar.png");
  });
});
