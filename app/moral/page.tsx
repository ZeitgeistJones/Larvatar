import { Suspense } from "react";
import MoralClient from "./MoralClient";

export default function MoralPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-10">
          <p className="text-sm opacity-60">loading moral compass…</p>
        </main>
      }
    >
      <MoralClient />
    </Suspense>
  );
}
