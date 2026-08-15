// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";

// OAuth providers — "Continue with GitHub" / "Continue with Google" on the
// sign-in page. Convex Auth reads the client ID/secret pairs from the
// deployment env (set them in the project's Keys/API keys tab):
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
// Without them the provider stays registered but every sign-in attempt fails
// with a clear error, so the buttons never render fake success.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, GitHub, Google],
});