import { redirect } from "next/navigation";

/** Human profile editing is gone. The signed-in screen is the post-login card. */
export default function OnboardingPage() {
  redirect("/profile");
}
