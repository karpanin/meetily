export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).__TAURI_INTERNALS__;
}

export function isTauriUnavailableError(error: unknown): boolean {
  const msg = String(error ?? '').toLowerCase();
  return (
    msg.includes('tauri api is not available') ||
    msg.includes('__tauri_internals__') ||
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
      const core = await import('@tauri-apps/api/core');
      if (!core || typeof core.invoke !== 'function') {
        throw new Error('Tauri API is not available in this runtime');
      }
      return await core.invoke<T>(command, args);
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
