"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AuthState, passwordAuth, sendMagicLink } from "./actions";

export function AuthForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [passwordState, passwordAction, passwordPending] = useActionState<AuthState, FormData>(passwordAuth, {
    error: initialError,
  });
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(sendMagicLink, {});

  return (
    <Card>
      <CardContent>
        <Tabs defaultValue="password">
          <TabsList className="w-full">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form action={passwordAction} className="space-y-4 pt-4">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="intent" value={mode} />
              <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={passwordState.email} />
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
              />
              <Status state={passwordState} />
              <Button type="submit" className="w-full" disabled={passwordPending}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form action={linkAction} className="space-y-4 pt-4">
              <input type="hidden" name="next" value={next} />
              <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={linkState.email} />
              <Status state={linkState} />
              <Button type="submit" className="w-full" disabled={linkPending}>
                Email me a sign-in link
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                New emails get an account automatically.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required {...props} />
    </div>
  );
}

function Status({ state }: { state: AuthState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-muted-foreground">{state.message}</p>;
  return null;
}
