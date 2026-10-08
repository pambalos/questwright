/** Present only when the app runs inside the Questwright desktop shell. */
export interface DesktopBridge {
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string | null): Promise<boolean>;
  info(): Promise<{ version: string; platform: string; keyEncrypted: boolean }>;
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { questwrightDesktop?: DesktopBridge }).questwrightDesktop;
}
