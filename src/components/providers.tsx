"use client";

import { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const UnreadContext = createContext<number>(0);

/** Number of unread notifications — server-passed via layout, updated by pages. */
export function UnreadProvider({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  return <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>;
}

export function useUnreadNotifications() {
  return useContext(UnreadContext);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
