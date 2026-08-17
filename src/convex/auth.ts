// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { emailOtp } from "./auth/emailOtp";
import { passwordReset } from "./auth/passwordReset";
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

// Email + password (primary login). Passwords are hashed server-side with
// Scrypt by the library; the reset flow emails a 6-digit code via the same
// Freebuff transport used for sign-in OTPs.
const password = Password({
  profile: (params: Record<string, unknown>) => {
    const email =
      typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }
    const name =
      typeof params.name === "string" && params.name.trim()
        ? params.name.trim().slice(0, 60)
        : undefined;
    const profile: { email: string; name?: string; isAnonymous: boolean } = {
      email,
      isAnonymous: false,
    };
    if (name) profile.name = name;
    return profile;
  },
  reset: passwordReset,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, GitHub, Google, password],
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