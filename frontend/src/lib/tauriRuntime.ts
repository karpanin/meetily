export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any)?.__TAURI_INTERNALS__?.invoke === 'function';
}

export function isTauriUnavailableError(error: unknown): boolean {
  const msg = String(error ?? '').toLowerCase();
  return (
    msg.includes('tauri api is not available') ||
    msg.includes('__tauri_internals__') ||
    msg.includes("reading 'invoke'") ||
    msg.includes('cannot read properties of undefined (reading \'invoke\')') ||
    msg.includes('transformcallback') ||
    msg.includes('ipc') ||
    msg.includes('not available in this runtime')
  );
}

export async function safeInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Tauri API is not available in this runtime');
  }

  const start = Date.now();
  const timeoutMs = 2500;
  let lastError: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const internals = (window as any)?.__TAURI_INTERNALS__;
      if (typeof internals?.invoke === 'function') {
        return await internals.invoke(command, args);
      }

      const core = await import('@tauri-apps/api/core');
      const invokeFn =
        (core as any)?.invoke ||
        (core as any)?.default?.invoke;
      if (typeof invokeFn === 'function') {
        return await invokeFn(command, args);
      }

      throw new Error('Tauri API is not available in this runtime');
    } catch (error) {
      lastError = error;
      if (!isTauriUnavailableError(error)) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 75));
    }
  }

  throw new Error(
    `Tauri API is not available in this runtime${lastError ? `: ${String(lastError)}` : ''}`
  );
}

export async function safeListen<T = unknown>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  if (typeof window === 'undefined') return () => {};

  const start = Date.now();
  const timeoutMs = 2500;
  let lastError: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const events = await import('@tauri-apps/api/event');
      return events.listen<T>(event, handler as any);
    } catch (error) {
      lastError = error;
      if (!isTauriUnavailableError(error)) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 75));
    }
  }

  console.warn(`Failed to subscribe to '${event}':`, lastError);
  return () => {};
}
