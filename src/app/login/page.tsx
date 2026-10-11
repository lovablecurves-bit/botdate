import { SignInScreen } from "@/components/sign-in-screen";

export const metadata = { title: "Enter" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; ref?: string }>;
}) {
  return <SignInScreen searchParams={searchParams} />;
}
