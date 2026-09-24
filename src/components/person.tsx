import { Avatar } from "@/components/avatar";
import { intentLabel, kidsLabel, smokingLabel, titleWord, initials } from "@/lib/labels";
import type { PublicPerson } from "@/lib/domain";

export function Portrait({ name, accent }: { name: string; accent: string }) {
  return (
    <div className="portrait" style={{ backgroundColor: accent }} aria-hidden="true">
      <span className="portrait-mark">{initials(name)}</span>
      <span className="portrait-caption">Photo placeholder</span>
    </div>
  );
}

export function PersonStrip({ person }: { person: PublicPerson }) {
  return (
    <div className="person-strip">
      <Avatar name={person.displayName} accent={person.accent} size="lg" />
      <div>
        <h1>{person.displayName}</h1>
        <p className="meta">
          {person.pronouns} · {person.age} · {person.city}
        </p>
      </div>
    </div>
  );
}

export function Facts({ person }: { person: PublicPerson }) {
  return (
    <ul className="facts">
      <li>{smokingLabel(person.smoking)}</li>
      <li>{kidsLabel(person.kids)}</li>
      <li>{intentLabel(person.intent)}</li>
      {person.interests.slice(0, 4).map((interest) => (
        <li key={interest}>{titleWord(interest)}</li>
      ))}
    </ul>
  );
}
