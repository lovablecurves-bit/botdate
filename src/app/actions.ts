"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, requireOnboarded, requireUser, setSession } from "@/lib/auth";
import { resetDatabase } from "@/lib/db/seed";
import { withDb } from "@/lib/db/open";
import {
  approveDraft,
  approveOffer,
  chooseChannel,
  createDraft,
  editDraft,
  getMember,
  killDraft,
  optIn,
  passOffer,
  proposeDate,
  respondToDate,
  tweakOffer,
  saveMember,
  sendHuman,
  setPaused,
  wipeMemory,
} from "@/lib/domain";
import type { ActionResult } from "@/lib/result";
import type { ChannelChoice, Intent, IntentFilter, KidsFilter, KidsStance, MemberInput, SmokingFilter } from "@/lib/types";

export type FormState = { ok: boolean; error: string | null; message: string | null };

function inputFromForm(formData: FormData): MemberInput {
  return {
    displayName: String(formData.get("displayName") ?? ""),
    pronouns: String(formData.get("pronouns") ?? ""),
    age: Number(formData.get("age")),
    city: String(formData.get("city") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    smoking: formData.get("smoking") === "on",
    kids: String(formData.get("kids") ?? "") as KidsStance,
    intent: String(formData.get("intent") ?? "") as Intent,
    interests: formData.getAll("interests").map(String),
    ageMin: Number(formData.get("ageMin")),
    ageMax: Number(formData.get("ageMax")),
    cities: formData.getAll("cities").map(String),
    smokingFilter: String(formData.get("smokingFilter") ?? "") as SmokingFilter,
    kidsFilter: String(formData.get("kidsFilter") ?? "") as KidsFilter,
    intentFilter: String(formData.get("intentFilter") ?? "") as IntentFilter,
    niceToHaves: String(formData.get("niceToHaves") ?? ""),
    locked: formData.get("locked") === "on",
  };
}

function touch(matchId?: string) {
  revalidatePath("/shortlist");
  revalidatePath("/desk");
  revalidatePath("/dates");
  revalidatePath("/onboarding");
  if (matchId) {
    revalidatePath(`/desk/${matchId}`);
    revalidatePath(`/intro/${matchId}`);
    revalidatePath(`/dates/${matchId}`);
  }
}

function bounce(path: string, result: ActionResult) {
  if (!result.ok) redirect(`${path}?error=${encodeURIComponent(result.error)}`);
}

export async function loginAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const member = await withDb((db) => getMember(db, userId));
  if (!member) redirect("/login?error=That+demo+member+is+not+in+the+seed.");
  await setSession(member.id);
  redirect(member.prefs.locked ? "/shortlist" : "/onboarding");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function resetDemoAction() {
  await withDb((db) => resetDatabase(db));
  await clearSession();
  redirect("/login");
}

export async function saveOnboardingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await withDb((db) => saveMember(db, user.id, inputFromForm(formData)));
  if (!result.ok) return { ok: false, error: result.error, message: null };
  touch();
  const locked = formData.get("locked") === "on";
  return {
    ok: true,
    error: null,
    message: locked ? "Saved. Your shortlist only shows people who clear both sets of dealbreakers." : "Saved. Lock dealbreakers to open your shortlist.",
  };
}

export async function setPausedAction(formData: FormData) {
  const user = await requireUser();
  const paused = String(formData.get("paused")) === "true";
  const result = await withDb((db) => setPaused(db, user.id, paused));
  if (!result.ok) redirect(`/onboarding?error=${encodeURIComponent(result.error)}`);
  touch();
  redirect(`/onboarding?notice=${paused ? "paused" : "unpaused"}`);
}

export async function wipeMemoryAction() {
  const user = await requireUser();
  const result = await withDb((db) => wipeMemory(db, user.id));
  if (!result.ok) redirect(`/onboarding?error=${encodeURIComponent(result.error)}`);
  touch();
  redirect("/onboarding?notice=wiped");
}

export async function approveOfferAction(matchId: string, proposalId: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => approveOffer(db, user.id, proposalId));
  touch(matchId);
  return result;
}

export async function passOfferAction(matchId: string, proposalId: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => passOffer(db, user.id, proposalId));
  touch(matchId);
  return result;
}

export async function tweakOfferAction(matchId: string, proposalId: string, local: string, place: string, note: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => tweakOffer(db, user.id, proposalId, { local, place, note }));
  touch(matchId);
  return result;
}

export async function approveDraftAction(messageId: string, body: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => approveDraft(db, user.id, messageId, body));
  touch();
  return result;
}

export async function editDraftAction(messageId: string, body: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => editDraft(db, user.id, messageId, body));
  touch();
  return result;
}

export async function killDraftAction(messageId: string): Promise<ActionResult> {
  const user = await requireOnboarded();
  const result = await withDb((db) => killDraft(db, user.id, messageId));
  touch();
  return result;
}

export async function createDraftAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const result = await withDb((db) => createDraft(db, user.id, matchId));
  touch(matchId);
  bounce(`/desk/${matchId}`, result);
  redirect(`/desk/${matchId}`);
}

export async function optInAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const result = await withDb((db) => optIn(db, user.id, matchId));
  touch(matchId);
  bounce(`/intro/${matchId}`, result);
  redirect(`/intro/${matchId}`);
}

export async function chooseChannelAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const choice = String(formData.get("choice") ?? "") as ChannelChoice;
  const result = await withDb((db) => chooseChannel(db, user.id, matchId, choice));
  touch(matchId);
  bounce(`/intro/${matchId}`, result);
  redirect(`/intro/${matchId}`);
}

export async function sendHumanAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const result = await withDb((db) => sendHuman(db, user.id, matchId, String(formData.get("body") ?? "")));
  touch(matchId);
  bounce(`/intro/${matchId}`, result);
  redirect(`/intro/${matchId}`);
}

export async function proposeDateAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const result = await withDb((db) => proposeDate(db, user.id, matchId, {
    local: String(formData.get("local") ?? ""),
    place: String(formData.get("place") ?? ""),
    note: String(formData.get("note") ?? ""),
  }));
  touch(matchId);
  bounce(`/dates/${matchId}`, result);
  redirect(`/dates/${matchId}`);
}

export async function respondDateAction(formData: FormData) {
  const user = await requireOnboarded();
  const matchId = String(formData.get("matchId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "confirm" | "decline" | "withdraw";
  const result = await withDb((db) => respondToDate(db, user.id, String(formData.get("proposalId") ?? ""), decision));
  touch(matchId);
  bounce(`/dates/${matchId}`, result);
  redirect(`/dates/${matchId}`);
}
