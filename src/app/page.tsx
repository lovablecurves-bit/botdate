import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/sign-in-screen";
import { currentMember, memberHome } from "@/lib/auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; ref?: string }>;
}) {
  const member = await currentMember();
  if (member) redirect(memberHome(member));
  return <SignInScreen searchParams={searchParams} />;
}
