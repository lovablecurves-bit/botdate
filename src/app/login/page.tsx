import { SignInScreen } from "@/components/sign-in-screen";

export const metadata = {
  title: "Enter",
  description: "Free for the first 1,000 members. Sign in with X.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; ref?: string }>;
}) {
  return <SignInScreen searchParams={searchParams} />;
}
