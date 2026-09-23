"use client";

import { useActionState } from "react";
import { saveOnboardingAction, type FormState } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { SubmitButton } from "@/components/submit-button";
import { CITIES, INTERESTS, PRONOUNS, type Member } from "@/lib/types";
import { titleWord } from "@/lib/labels";

const initial: FormState = { ok: false, error: null, message: null };

export function OnboardingForm({ member }: { member: Member }) {
  const [state, action] = useActionState(saveOnboardingAction, initial);
  return (
    <form action={action} className="stack">
      <section className="card stack">
        <div className="photo-row">
          <div className="photo-ph" style={{ background: member.profile.accent }}>
            <Avatar name={member.displayName} accent={member.profile.accent} size="lg" />
            <span>Photo placeholder</span>
          </div>
          <div>
            <h2>About you</h2>
            <p className="help">This is the profile other matchmakers are allowed to read. Photos stay a placeholder in this MVP.</p>
          </div>
        </div>
        <label className="field">
          <span>Name</span>
          <input name="displayName" defaultValue={member.displayName} required maxLength={60} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Pronouns</span>
            <select name="pronouns" defaultValue={member.profile.pronouns}>
              {PRONOUNS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Age</span>
            <input name="age" type="number" min={18} max={99} defaultValue={member.profile.age} required />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>City</span>
            <select name="city" defaultValue={member.profile.city}>
              {CITIES.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Occupation</span>
            <input name="occupation" defaultValue={member.profile.occupation} required maxLength={80} />
          </label>
        </div>
        <label className="field">
          <span>Bio</span>
          <textarea name="bio" defaultValue={member.profile.bio} required maxLength={500} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Kids</span>
            <select name="kids" defaultValue={member.profile.kids}>
              <option value="wants">Wants kids</option>
              <option value="open">Open to kids</option>
              <option value="doesnt">Doesn't want kids</option>
            </select>
          </label>
          <label className="field">
            <span>Intent</span>
            <select name="intent" defaultValue={member.profile.intent}>
              <option value="serious">Serious</option>
              <option value="casual">Casual</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="smoking" defaultChecked={member.profile.smoking} />
          <span>I smoke</span>
        </label>
      </section>

      <section className="card stack">
        <div>
          <h2>Dealbreakers</h2>
          <p className="help">A miss never reaches your shortlist. You also stay off someone else's list when you miss theirs.</p>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Youngest</span>
            <input name="ageMin" type="number" min={18} max={99} defaultValue={member.prefs.ageMin} required />
          </label>
          <label className="field">
            <span>Oldest</span>
            <input name="ageMax" type="number" min={18} max={99} defaultValue={member.prefs.ageMax} required />
          </label>
        </div>
        <fieldset className="stack tight">
          <legend>Cities you will meet in</legend>
          <div className="chips">
            {CITIES.map((city) => (
              <label className="chip" key={city}>
                <input type="checkbox" name="cities" value={city} defaultChecked={member.prefs.cities.includes(city)} />
                <span>{city}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Smoking</span>
          <select name="smokingFilter" defaultValue={member.prefs.smoking}>
            <option value="no">No smokers</option>
            <option value="any">Smoking is not a dealbreaker</option>
          </select>
        </label>
        <label className="field">
          <span>Kids</span>
          <select name="kidsFilter" defaultValue={member.prefs.kids}>
            <option value="wants">Must want kids, or be open</option>
            <option value="doesnt">Must not want kids, or be open</option>
            <option value="any">No kids dealbreaker</option>
          </select>
        </label>
        <label className="field">
          <span>Intent</span>
          <select name="intentFilter" defaultValue={member.prefs.intent}>
            <option value="serious">Serious only</option>
            <option value="casual">Casual only</option>
            <option value="any">No intent dealbreaker</option>
          </select>
        </label>
      </section>

      <section className="card stack">
        <div>
          <h2>Must-haves and nice-to-haves</h2>
          <p className="help">These rank the shortlist. They do not hide anyone. Shared interests and the same city move a person up.</p>
        </div>
        <fieldset className="stack tight">
          <legend>Interests to reward</legend>
          <div className="chips">
            {INTERESTS.map((interest) => (
              <label className="chip" key={interest}>
                <input type="checkbox" name="interests" value={interest} defaultChecked={member.profile.interests.includes(interest)} />
                <span>{titleWord(interest)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Nice-to-haves</span>
          <textarea name="niceToHaves" defaultValue={member.prefs.niceToHaves} maxLength={400} placeholder="A note your matchmaker keeps. The MVP ranker does not parse this text." />
        </label>
        <label className="check lock">
          <input type="checkbox" name="locked" defaultChecked={member.prefs.locked} />
          <span>Lock dealbreakers and must-haves. While this is on, the shortlist is live.</span>
        </label>
      </section>

      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="banner good" role="status">
          {state.message}
        </p>
      ) : null}
      <SubmitButton className="btn primary" pendingLabel="Saving…" testId="save-profile">
        Save profile
      </SubmitButton>
    </form>
  );
}
