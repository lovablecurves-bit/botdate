import { onboardingView } from "@/lib/onboarding";
import type { OnboardingAnswers, OnboardingQuestion } from "@/lib/types";

function summary(answer: unknown): string {
  if (answer == null) return "";
  if (Array.isArray(answer)) return answer.map(String).join(", ");
  if (typeof answer === "object") {
    return Object.values(answer)
      .filter((value) => value != null && value !== "")
      .map(String)
      .join(" · ");
  }
  return String(answer);
}

function row(question: OnboardingQuestion) {
  const text = summary(question.answer);
  return (
    <li key={question.id} data-testid={`onboarding-${question.id}`} data-answered={question.answered ? "true" : "false"}>
      <span>{question.label}</span>
      <span className={question.answered ? "done" : "todo"}>{question.answered ? text || "Answered" : "Missing"}</span>
    </li>
  );
}

export function OnboardingProgress({ onboarding }: { onboarding: OnboardingAnswers }) {
  const view = onboardingView(onboarding);
  const answered = view.answered.length;
  const total = view.questions.length;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  return (
    <section className="onboarding-progress stack tight" data-testid="onboarding-progress" data-complete={view.profile_complete ? "true" : "false"}>
      <div>
        <h2>Interview</h2>
        <p className="help">
          {view.profile_complete
            ? "Your bot has the interview. Must-haves and dealbreakers are hard filters, and it can browse, message, and propose dates."
            : "Your bot asks these in conversation, one or two at a time. Browsing, messaging, and date proposals stay closed until every line is answered."}
        </p>
      </div>
      <p data-testid="onboarding-count">
        {answered} of {total} answered
      </p>
      <div className="meter" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total} aria-label="Onboarding progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ul className="question-list">{view.questions.map(row)}</ul>
    </section>
  );
}
