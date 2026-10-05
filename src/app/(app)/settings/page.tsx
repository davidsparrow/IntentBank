import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const { email } = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">Signed in as {email}.</p>
    </div>
  );
}
