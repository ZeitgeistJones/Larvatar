import { Suspense } from "react";
import ShareCompassClient from "./ShareCompassClient";

export default function ShareCompassPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-10">
          <p className="text-sm opacity-60">rendering share card…</p>
        </main>
      }
    >
      <ShareCompassClient />
    </Suspense>
  );
}
