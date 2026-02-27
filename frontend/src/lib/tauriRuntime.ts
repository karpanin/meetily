export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).__TAURI_INTERNALS__;
}

async function waitForTauriRuntime(timeoutMs = 1500): Promise<boolean> {
  if (isTauriRuntime()) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
    if (isTauriRuntime()) return true;
  }
  return false;
}

export async function safeInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const ready = await waitForTauriRuntime();
  if (!ready) {
    throw new Error('Tauri API is not available in this runtime');
  }
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

export async function safeListen<T = unknown>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const ready = await waitForTauriRuntime();
  if (!ready) {
    return () => {};
  }
  const events = await import('@tauri-apps/api/event');
  return events.listen<T>(event, handler as any);
}
