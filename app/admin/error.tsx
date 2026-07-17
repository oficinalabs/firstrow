"use client";

import { ErrorView } from "@/components/admin/error-view";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
