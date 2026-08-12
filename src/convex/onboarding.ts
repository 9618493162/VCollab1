import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/** Mark the signed-in user as having completed the first-run wizard (Phase 57). */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to continue");
    await ctx.db.patch(userId, { onboardedAt: Date.now() });
  },
});

/** Whether the signed-in user still needs the onboarding wizard. */
export const needsOnboarding = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return user?.onboardedAt === undefined;
  },
});
