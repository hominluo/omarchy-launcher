// JSON-RPC 2.0 over NDJSON between omarchy-shell (host) and this sidecar.
// One object per line; requests carry an id, notifications do not.

export const PROTOCOL_VERSION = 1

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export interface RpcRequest { jsonrpc: "2.0"; id?: string | number; method: string; params?: any }
export interface RpcResponse { jsonrpc: "2.0"; id: string | number; result?: any; error?: { code: number; message: string; data?: any } }
export type RpcMessage = RpcRequest | RpcResponse

// ---- host -> sidecar

export interface LoadParams {
  s: string                                   // session id (host-generated)
  extensionId: string                         // "<owner>/<name>"
  extensionDir: string
  command: { name: string; mode: "view" | "no-view" | "menu-bar"; title: string }
  entrypoint: string
  preferences: Record<string, unknown>
  arguments: Record<string, string>
  launchContext?: unknown
  fallbackText?: string
  launchType: "userInitiated" | "background"
  env: { appearance: "light" | "dark"; textSize: "medium" | "large"; isDevelopment: boolean }
  paths: { assets: string; support: string }
}

// ---- sidecar -> host view model (mirrors lib/ViewModel.js on the QML side)

export interface ViewRender { s: string; rev: number; views: Array<{ view: string; root: any }> }

export function isRequest(m: RpcMessage): m is RpcRequest { return typeof (m as any).method === "string" }
