"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  // Design: outline destructive (fundo transparente, borda + texto destructive).
  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={loading}
      onClick={onClick}
    >
      {loading ? "A terminar…" : "Terminar sessão"}
    </Button>
  );
}
