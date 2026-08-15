// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import GitHub from "@auth/core/providers/github";

// GitHub OAuth — "Continue with GitHub" on the sign-in page. Convex Auth
// reads GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET from the deployment env
// (set them in the project's Keys/API keys tab). Without them the provider
// stays registered but every sign-in attempt fails with a clear error, so
// the button never renders fake success.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, GitHub],
});