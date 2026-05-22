import { createContext, useContext, type ReactNode } from "react";
import { createDalpClient, type DalpClient, type DalpClientOptions } from "./index";

const DalpContext = createContext<DalpClient | null>(null);

export type DalpProviderProps = DalpClientOptions & {
  children: ReactNode;
};

export function DalpProvider({ children, ...options }: DalpProviderProps) {
  const client = createDalpClient(options);
  return <DalpContext.Provider value={client}>{children}</DalpContext.Provider>;
}

export function useDalp(): DalpClient {
  const client = useContext(DalpContext);
  if (!client) {
    throw new Error("useDalp must be used inside <DalpProvider>");
  }
  return client;
}
