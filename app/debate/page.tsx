import { Suspense } from "react";
import DebateClient from "./DebateClient";

export default function DebatePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-10">
          <p className="text-sm opacity-60">loading debate ring…</p>
        </main>
      }
    >
      <DebateClient />
    </Suspense>
  );
}
