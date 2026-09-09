/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as agenda from "../agenda.js";
import type * as ai from "../ai.js";
import type * as aiData from "../aiData.js";
import type * as announcements from "../announcements.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as auth_changePassword from "../auth/changePassword.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_passwordReset from "../auth/passwordReset.js";
import type * as breakouts from "../breakouts.js";
import type * as call from "../call.js";
import type * as channels from "../channels.js";
import type * as collab from "../collab.js";
import type * as dms from "../dms.js";
import type * as emails from "../emails.js";
import type * as export_ from "../export.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as livekit from "../livekit.js";
import type * as meetings from "../meetings.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as polls from "../polls.js";
import type * as premium from "../premium.js";
import type * as presence from "../presence.js";
import type * as qa from "../qa.js";
import type * as recording from "../recording.js";
import type * as rooms from "../rooms.js";
import type * as search from "../search.js";
import type * as security from "../security.js";
import type * as settings from "../settings.js";
import type * as supabase from "../supabase.js";
import type * as supabaseData from "../supabaseData.js";
import type * as support from "../support.js";
import type * as users from "../users.js";
import type * as whiteboard from "../whiteboard.js";
import type * as workspaceMeetings from "../workspaceMeetings.js";
import type * as workspacePolicies from "../workspacePolicies.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  agenda: typeof agenda;
  ai: typeof ai;
  aiData: typeof aiData;
  announcements: typeof announcements;
  audit: typeof audit;
  auth: typeof auth;
  "auth/changePassword": typeof auth_changePassword;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/passwordReset": typeof auth_passwordReset;
  breakouts: typeof breakouts;
  call: typeof call;
  channels: typeof channels;
  collab: typeof collab;
  dms: typeof dms;
  emails: typeof emails;
  export: typeof export_;
  github: typeof github;
  http: typeof http;
  invitations: typeof invitations;
  livekit: typeof livekit;
  meetings: typeof meetings;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  polls: typeof polls;
  premium: typeof premium;
  presence: typeof presence;
  qa: typeof qa;
  recording: typeof recording;
  rooms: typeof rooms;
  search: typeof search;
  security: typeof security;
  settings: typeof settings;
  supabase: typeof supabase;
  supabaseData: typeof supabaseData;
  support: typeof support;
  users: typeof users;
  whiteboard: typeof whiteboard;
  workspaceMeetings: typeof workspaceMeetings;
  workspacePolicies: typeof workspacePolicies;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
