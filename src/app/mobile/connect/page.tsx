import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/devUser";
import { prisma } from "@/lib/db";
import { createMobileGrant, validateMobileAuthorization } from "@/lib/mobileAuth";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your iPhone" };

export default async function ConnectMobile({ searchParams }: {
  searchParams: Promise<{ challenge?: string; state?: string; redirectUri?: string }>;
}) {
  const params = await searchParams;
  let authorization: ReturnType<typeof validateMobileAuthorization>;
  try { authorization = validateMobileAuthorization(params.challenge ?? "", params.state ?? "", params.redirectUri ?? ""); }
  catch { return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">Open Studyflow on your iPhone</h1><p className="mt-4">Start sign-in from the app to connect your account securely.</p></main>; }
  const userId = await getCurrentUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });

  async function connect() {
    "use server";
    const currentUser = await getCurrentUserId();
    if (!checkRateLimit("MUTATION", `mobile-grant:${currentUser}`)) throw new Error("Please wait a minute before reconnecting.");
    const code = await createMobileGrant(currentUser, authorization.challenge);
    const callback = new URL(authorization.callback);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", authorization.state);
    redirect(callback.href);
  }

  return <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
    <p className="text-sm font-semibold text-brand">STUDYFLOW FOR IPHONE</p>
    <h1 className="text-3xl font-bold">Your study plan, with you.</h1>
    <p>Connect the iPhone app as <strong>{user.email}</strong>. It can read your plan and save your study progress.</p>
    <form action={connect}><Button type="submit" size="lg">Connect iPhone app</Button></form>
    <p className="text-sm text-muted-foreground">Only continue if you started this sign-in from Studyflow on your own device.</p>
  </main>;
}
