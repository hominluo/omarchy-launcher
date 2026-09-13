// Model providers for AI.ask (extensions) and the launcher's own AI commands.
// Configuration: ~/.config/omarchy-launcher/ai.json
//   { "default": "anthropic",
//     "providers": {
//       "anthropic": { "apiKey": "...", "model": "claude-sonnet-5" },
//       "openai":    { "baseUrl": "https://api.openai.com/v1", "apiKey": "...", "model": "gpt-4o-mini" },
//       "ollama":    { "baseUrl": "http://localhost:11434", "model": "llama3.2" } },
//     "modelMap": { "Anthropic_": "anthropic", "OpenAI_": "openai", "*": "default" } }
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface AskOptions { model?: string | null; creativity?: string | number | null; system?: string; signal?: AbortSignal }
export interface ProviderConfig { apiKey?: string; baseUrl?: string; model?: string; maxTokens?: number }
export interface AiConfig { default?: string; providers?: Record<string, ProviderConfig>; modelMap?: Record<string, string> }

const CONFIG_PATH = path.join(os.homedir(), ".config", "omarchy-launcher", "ai.json")
const DEFAULT_MODELS: Record<string, string> = { anthropic: "claude-sonnet-5", openai: "gpt-4o-mini", ollama: "llama3.2" }

export function loadConfig(): AiConfig {
  try {
    const d = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
    return d && typeof d === "object" ? d : {}
  } catch { return {} }
}

export function configuredProviders(cfg = loadConfig()): string[] {
  const out: string[] = []
  const p = cfg.providers || {}
  if (p.anthropic && p.anthropic.apiKey) out.push("anthropic")
  if (p.openai && p.openai.apiKey) out.push("openai")
  if (p.ollama) out.push("ollama")
  return out
}

export function isConfigured(): boolean { return configuredProviders().length > 0 }

function temperature(creativity: any): number | undefined {
  if (creativity === undefined || creativity === null) return undefined
  if (typeof creativity === "number") return Math.max(0, Math.min(2, creativity))
  return ({ none: 0, low: 0.3, medium: 0.7, high: 1, maximum: 1.2 } as any)[String(creativity)] ?? undefined
}

// Pick provider + model. `requested` is a Raycast AI.Model value (e.g.
// "Anthropic_Claude_Sonnet") or a "provider:model" string.
export function resolve(requested: string | null | undefined, cfg = loadConfig()): { provider: string; model: string; config: ProviderConfig } | null {
  const providers = cfg.providers || {}
  const available = configuredProviders(cfg)
  if (!available.length) return null
  let provider = cfg.default && available.indexOf(cfg.default) >= 0 ? cfg.default : available[0]
  let model = ""
  const req = String(requested || "")
  const colon = req.indexOf(":")
  if (colon > 0 && available.indexOf(req.slice(0, colon)) >= 0) { provider = req.slice(0, colon); model = req.slice(colon + 1) }
  else if (req) {
    const map = cfg.modelMap || {}
    for (const prefix of Object.keys(map)) {
      if (prefix !== "*" && req.startsWith(prefix) && available.indexOf(map[prefix]) >= 0) { provider = map[prefix]; break }
    }
    if (!Object.keys(map).length) {
      if (/^Anthropic_/i.test(req) && available.indexOf("anthropic") >= 0) provider = "anthropic"
      else if (/^OpenAI_/i.test(req) && available.indexOf("openai") >= 0) provider = "openai"
    }
  }
  const config = providers[provider] || {}
  return { provider, model: model || config.model || DEFAULT_MODELS[provider], config }
}

export async function* stream(messages: ChatMessage[], options: AskOptions = {}): AsyncGenerator<string> {
  const r = resolve(options.model)
  if (!r) throw new Error("No AI provider is configured. Add one to ~/.config/omarchy-launcher/ai.json")
  const temp = temperature(options.creativity)
  if (r.provider === "anthropic") yield* anthropic(messages, r.model, r.config, temp, options)
  else if (r.provider === "ollama") yield* ollama(messages, r.model, r.config, temp, options)
  else yield* openai(messages, r.model, r.config, temp, options)
}

async function* sse(res: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!res.body) return
  const reader = (res.body as any).getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2)
      let event = "message", data = ""
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trim()
      }
      if (data) yield { event, data }
    }
  }
}

async function* anthropic(messages: ChatMessage[], model: string, cfg: ProviderConfig, temp: number | undefined, options: AskOptions) {
  const system = [options.system || "", ...messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean).join("\n\n")
  const body: any = { model, max_tokens: cfg.maxTokens || 2048, stream: true, messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })) }
  if (system) body.system = system
  if (temp !== undefined) body.temperature = Math.min(1, temp)
  const res = await fetch((cfg.baseUrl || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST", signal: options.signal,
    headers: { "content-type": "application/json", "x-api-key": String(cfg.apiKey), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  for await (const ev of sse(res)) {
    if (ev.event === "content_block_delta") {
      try { const d = JSON.parse(ev.data); if (d.delta && d.delta.type === "text_delta" && d.delta.text) yield String(d.delta.text) } catch {}
    } else if (ev.event === "error") throw new Error("Anthropic stream error: " + ev.data)
  }
}

async function* openai(messages: ChatMessage[], model: string, cfg: ProviderConfig, temp: number | undefined, options: AskOptions) {
  const msgs = (options.system ? [{ role: "system", content: options.system }] : []).concat(messages as any)
  const body: any = { model, stream: true, messages: msgs }
  if (temp !== undefined) body.temperature = temp
  const res = await fetch((cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions", {
    method: "POST", signal: options.signal,
    headers: { "content-type": "application/json", "authorization": "Bearer " + String(cfg.apiKey || "") },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`OpenAI-compatible API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  for await (const ev of sse(res)) {
    if (ev.data === "[DONE]") break
    try { const d = JSON.parse(ev.data); const t = d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content; if (t) yield String(t) } catch {}
  }
}

async function* ollama(messages: ChatMessage[], model: string, cfg: ProviderConfig, temp: number | undefined, options: AskOptions) {
  const msgs = (options.system ? [{ role: "system", content: options.system }] : []).concat(messages as any)
  const body: any = { model, stream: true, messages: msgs }
  if (temp !== undefined) body.options = { temperature: temp }
  const res = await fetch((cfg.baseUrl || "http://localhost:11434").replace(/\/$/, "") + "/api/chat", { method: "POST", signal: options.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const reader = (res.body as any).getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1)
      if (!line) continue
      try { const d = JSON.parse(line); if (d.message && d.message.content) yield String(d.message.content); if (d.done) return } catch {}
    }
  }
}
