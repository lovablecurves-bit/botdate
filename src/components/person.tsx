import { Avatar } from "@/components/avatar";
import { intentLabel, kidsLabel, smokingLabel, titleWord } from "@/lib/labels";
import type { PublicPerson } from "@/lib/domain";

export function PersonStrip({ person }: { person: PublicPerson }) {
  return (
    <div className="person-strip">
      <Avatar name={person.displayName} accent={person.accent} size="lg" />
      <div>
        <p className="kicker">{person.pronouns}</p>
        <h1>{person.displayName}</h1>
        <p className="meta">
          {person.age} · {person.occupation} · {person.city}
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
