"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        {(id) => <Input id={id} name="email" type="email" autoComplete="email" required defaultValue={state.email} />}
      </Field>
      <Field label="Password" error={state.error}>
        {(id, d) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.error)}
            aria-describedby={d}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" pending={pending} className="mt-2">
        Sign in
      </Button>
    </form>
  );
}
