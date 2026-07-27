import { redirect } from "next/navigation";

/** Old Card Sharks URL → Over/Under */
export default function CardSharksRedirect() {
  redirect("/over-under");
}
