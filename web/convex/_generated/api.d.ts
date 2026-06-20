/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as auth_ResendOTP from "../auth/ResendOTP.js";
import type * as chat from "../chat.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as interview from "../interview.js";
import type * as jobs from "../jobs.js";
import type * as milestones from "../milestones.js";
import type * as notes from "../notes.js";
import type * as plans from "../plans.js";
import type * as proficiency from "../proficiency.js";
import type * as profile from "../profile.js";
import type * as resources from "../resources.js";
import type * as sketches from "../sketches.js";
import type * as telegram from "../telegram.js";
import type * as userSettings from "../userSettings.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  auth: typeof auth;
  "auth/ResendOTP": typeof auth_ResendOTP;
  chat: typeof chat;
  conversations: typeof conversations;
  crons: typeof crons;
  http: typeof http;
  interview: typeof interview;
  jobs: typeof jobs;
  milestones: typeof milestones;
  notes: typeof notes;
  plans: typeof plans;
  proficiency: typeof proficiency;
  profile: typeof profile;
  resources: typeof resources;
  sketches: typeof sketches;
  telegram: typeof telegram;
  userSettings: typeof userSettings;
  voice: typeof voice;
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
