// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { api } from "../convex/_generated/api";
import { insertUser, makeTestClient, type TestClient } from "./convex-test-client";
import type { Id } from "../convex/_generated/dataModel";

// Never hit the real email API during tests — capture the reset/OTP code that
// the auth carrier would have emailed instead.
vi.mock("axios");
const mockPost = vi.mocked(axios.post);

const PASSWORD = "supersecret123";

async function signUpPassword(
  t: TestClient,
  email: string,
  name = "Test User",
): Promise<Id<"users">> {
  const result = await t.action(api.auth.signIn, {
    provider: "password",
    params: { flow: "signUp", email, password: PASSWORD, name },
  });
  expect(result).toHaveProperty("tokens");
  const user = await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique(),
  );
  expect(user).not.toBeNull();
  return user!._id;
}

describe("password auth (email + password)", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: {} });
  });

  it("signs up a real account with a hashed password and profile name", async () => {
    const t = makeTestClient();
    const email = "alice@example.com";
    const userId = await signUpPassword(t, email, "Alice");

    // Profile name persisted through the provider profile callback.
    const me = t.withIdentity({ subject: userId });
    const profile = await me.query(api.users.currentUser);
    expect(profile).toMatchObject({
      name: "Alice",
      email,
      isAnonymous: false,
    });

    // Duplicate sign-up reuses the existing account (the library links back
    // to it) — the app guards the duplicate case with `users.emailExists`
    // before the form ever calls signUp. Profile data isn't overwritten.
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signUp", email, password: PASSWORD, name: "Imposter" },
    });
    const profileAfter = await me.query(api.users.currentUser);
    expect(profileAfter?.name).toBe("Alice");
  });

  it("signs in with the correct password and rejects a wrong one", async () => {
    const t = makeTestClient();
    const email = "bob@example.com";
    await signUpPassword(t, email, "Bob");

    const ok = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password: PASSWORD },
    });
    expect(ok).toHaveProperty("tokens");

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email, password: "wrong-password" },
      }),
    ).rejects.toThrow(/InvalidSecret|Invalid credentials/i);
  });

  it("rejects short passwords on sign-up", async () => {
    const t = makeTestClient();
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email: "short@example.com", password: "123" },
      }),
    ).rejects.toThrow();
  });

  it("changes the password only after verifying the current one", async () => {
    const t = makeTestClient();
    const email = "carol@example.com";
    const userId = await signUpPassword(t, email, "Carol");
    const me = t.withIdentity({ subject: userId });

    // Wrong current password → rejected, nothing changes.
    await expect(
      me.action(api.auth.changePassword.changePassword, {
        currentPassword: "not-the-password",
        newPassword: "brandnewpass99",
      }),
    ).rejects.toThrow(/incorrect/i);

    // Old password still works.
    const stillWorks = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password: PASSWORD },
    });
    expect(stillWorks).toHaveProperty("tokens");

    // Correct current password → password changes.
    await expect(
      me.action(api.auth.changePassword.changePassword, {
        currentPassword: PASSWORD,
        newPassword: "brandnewpass99",
      }),
    ).resolves.toEqual({ success: true });

    // Old password rejected, new password accepted.
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email, password: PASSWORD },
      }),
    ).rejects.toThrow(/InvalidSecret|Invalid credentials/i);
    const newWorks = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password: "brandnewpass99" },
    });
    expect(newWorks).toHaveProperty("tokens");
  });

  it("refuses to change a password for accounts without one", async () => {
    const t = makeTestClient();
    const userId = await insertUser(t, "oauth@example.com", "OAuth User");
    const me = t.withIdentity({ subject: userId });
    await expect(
      me.action(api.auth.changePassword.changePassword, {
        currentPassword: "whatever123",
        newPassword: "brandnewpass99",
      }),
    ).rejects.toThrow(/doesn't have a password/i);
  });

  it("resets a forgotten password via the emailed code", async () => {
    const t = makeTestClient();
    const email = "dave@example.com";
    await signUpPassword(t, email, "Dave");

    // Request a reset → the carrier emails a 6-digit code (captured here).
    // (The action resolves with `{ tokens: null }` — the "started" kind maps
    // to null — but the side effect is what matters: the code was sent.)
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email },
    });
    expect(mockPost).toHaveBeenCalled();
    const sentCodes = mockPost.mock.calls
      .map((call) => (call[1] as { otp?: string } | undefined)?.otp)
      .filter((code): code is string => Boolean(code));
    const code = sentCodes[sentCodes.length - 1];
    expect(code).toMatch(/^\d{6}$/);

    // Verify the code and set a new password.
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "reset-verification",
          email,
          code,
          newPassword: "resetpass456",
        },
      }),
    ).resolves.toBeTruthy();

    // Old password is dead, new one works.
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email, password: PASSWORD },
      }),
    ).rejects.toThrow(/InvalidSecret|Invalid credentials/i);
    const newWorks = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signIn", email, password: "resetpass456" },
    });
    expect(newWorks).toHaveProperty("tokens");
  });
});
