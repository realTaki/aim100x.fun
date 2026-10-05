import { createServerFn } from "@tanstack/react-start";

export const readWelcomeEntered = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    const { hasWelcomeEnteredOnRequest } = await import("@/lib/welcome-entry.server");
    return hasWelcomeEnteredOnRequest();
  },
);
