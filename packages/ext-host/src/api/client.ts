// The per-session bridge the shim talks through. Installed by the worker
// before the extension bundle is required; never cached by importers at
// module load (they call getClient() when needed).
export interface SessionClient {
  sessionId: string
  request(method: string, params?: any, timeoutMs?: number): Promise<any>
  notify(method: string, params?: any): void
  on(method: string, handler: (params: any) => void): void
  env: {
    appearance: "light" | "dark"; textSize: "medium" | "large"; isDevelopment: boolean
    extensionName: string; ownerOrAuthorName: string; commandName: string; commandMode: "view" | "no-view" | "menu-bar"
    assetsPath: string; supportPath: string; launchType: "userInitiated" | "background"
    launchContext?: any; capabilities: Record<string, boolean>
  }
  preferences: Record<string, unknown>
  navigation: { push(element: any): Promise<void>; pop(): Promise<void> } | null
  log(line: string): void
}

let client: SessionClient | null = null
export function setClient(c: SessionClient) { client = c }
export function getClient(): SessionClient {
  if (!client) throw new Error("@raycast/api used outside of a command session")
  return client
}
export function unsupported(name: string): never {
  throw new Error(`${name} is not supported by Omarchy Launcher`)
}
