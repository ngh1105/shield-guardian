export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unsupported";

export type WalletState = {
  address: string | null;
  status: WalletStatus;
  invalidationKey: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  bumpInvalidation: () => void;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
  }
}
