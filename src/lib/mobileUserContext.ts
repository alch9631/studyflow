import { AsyncLocalStorage } from "node:async_hooks";

// Only the bearer-authenticated mobile adapter supplies this context. No header,
// form field or exported Server Action can set it. AsyncLocalStorage prevents
// concurrent devices from sharing identities, including across awaits.
const identity = new AsyncLocalStorage<string>();
export const authenticatedMobileUser = () => identity.getStore();
export function withAuthenticatedMobileUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  return identity.run(userId, run);
}
