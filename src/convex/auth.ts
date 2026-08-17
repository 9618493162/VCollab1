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
// The platform injects SITE_URL pointing at the Convex site (…convex.site),
// which would make OAuth/email-OTP callbacks land on "No matching routes
// found" there instead of the app. Resolve relative post-auth redirects
// against the app URL unless SITE_URL has been set to a real app host.
const APP_ORIGIN = "https://vcollab.freebuff.app";

function postAuthBaseUrl() {
  const configured = process.env.SITE_URL?.replace(/\/+$/, "");
  if (configured && !configured.includes(".convex.site")) {
    return configured;
  }
  return APP_ORIGIN;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, GitHub, Google],
  callbacks: {
    // Redirect OAuth/OTP sign-ins back to the app (never the Convex site).
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${postAuthBaseUrl()}${redirectTo}`;
      }
      return redirectTo;
    },
  },
});