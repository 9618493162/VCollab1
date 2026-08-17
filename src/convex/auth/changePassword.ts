import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";

/**
 * Change the signed-in user's password.
 *
 * Real credential change: the current password is verified against the
 * stored Scrypt hash (rate-limited by the auth library), the new hash is
 * written, and every other session is invalidated so old tokens can't be
 * reused after the change. The current session stays signed in.
 */
export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to change your password.");
    }
    if (!currentPassword) {
      throw new Error("Enter your current password.");
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    const user = await ctx.runQuery(api.users.currentUser);
    const email = user?.email?.trim().toLowerCase();
    if (!email) {
      throw new Error(
        "This account has no email on file, so its password can't be changed here.",
      );
    }

    // Verify the current password against the stored hash. Throws with
    // "InvalidSecret" / "InvalidAccountId" / "TooManyFailedAttempts" on
    // failure — the library rate-limits repeated attempts server-side.
    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email, secret: currentPassword },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "InvalidSecret") {
        throw new Error("Your current password is incorrect.");
      }
      if (message === "InvalidAccountId") {
        throw new Error(
          "This account doesn't have a password — sign in with a provider instead.",
        );
      }
      if (message === "TooManyFailedAttempts") {
        throw new Error(
          "Too many failed attempts. Wait a moment and try again.",
        );
      }
      throw error;
    }

    if (newPassword === currentPassword) {
      throw new Error("New password must be different from the current one.");
    }

    // Write the new hash and invalidate all other sessions.
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });

    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId,
      except: sessionId ? [sessionId] : undefined,
    });

    return { success: true };
  },
});
