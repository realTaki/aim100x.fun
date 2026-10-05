import { getRequest } from "@tanstack/react-start/server";
import { cookieIndicatesWelcomeEntered } from "./welcome-entry";

export function hasWelcomeEnteredOnRequest(): boolean {
  const request = getRequest();
  if (!request) return false;
  return cookieIndicatesWelcomeEntered(request.headers.get("cookie") ?? "");
}
