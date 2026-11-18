import { redirect } from "next/navigation";

/** The chat is now the home page. Keep old /chat links working. */
export default function ChatRedirect() {
  redirect("/");
}
