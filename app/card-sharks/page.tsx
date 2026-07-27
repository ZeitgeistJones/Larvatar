import { redirect } from "next/navigation";

/** Old Card Sharks URL → Up/Down */
export default function CardSharksRedirect() {
  redirect("/up-down");
}
