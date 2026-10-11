import { redirect } from "next/navigation";
import { currentMember, memberHome, safePostLoginPath } from "@/lib/auth";

export default async function Home() {
  const member = await currentMember();
  redirect(member ? safePostLoginPath(memberHome(member)) : "/login");
}
