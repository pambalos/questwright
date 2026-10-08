/** Present only when the app runs inside the Questwright desktop shell. */
export interface DesktopBridge {
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string | null): Promise<boolean>;
  info(): Promise<{ version: string; platform: string; keyEncrypted: boolean }>;
  /** Shows a character in Questwright Studio; with `launch`, starts the studio if it is not running. Resolves to an error message, or null. */
  openStudio?(characterJson: string, launch: boolean): Promise<string | null>;
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { questwrightDesktop?: DesktopBridge }).questwrightDesktop;
}
