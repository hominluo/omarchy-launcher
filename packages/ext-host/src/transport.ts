// NDJSON framing over a readable/writable pair, with request bookkeeping.
import { RpcMessage, RpcRequest } from "./protocol"

export class Transport {
  private buffer = ""
  private nextId = 2                     // host uses odd ids, we use even
  private pending = new Map<string | number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  onNotification: (method: string, params: any) => void = () => {}
  onRequest: (method: string, params: any, id: string | number) => Promise<any> | any = () => { throw new Error("unhandled") }

  constructor(private input: NodeJS.ReadableStream, private output: NodeJS.WritableStream, private idPrefix = "") {
    input.setEncoding("utf8")
    input.on("data", (chunk: string) => this.feed(chunk))
    input.on("end", () => this.rejectAll("transport closed"))
  }

  feed(chunk: string) {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      let msg: RpcMessage
      try { msg = JSON.parse(line) } catch { this.log("bad frame: " + line.slice(0, 200)); continue }
      this.dispatch(msg)
    }
  }

  dispatch(msg: any) {
    if (typeof msg.method === "string") {
      if (msg.id === undefined) { try { this.onNotification(msg.method, msg.params) } catch (e) { this.log("notification handler threw: " + String(e)) } return }
      Promise.resolve().then(() => this.onRequest(msg.method, msg.params, msg.id)).then(
        (result) => this.write({ jsonrpc: "2.0", id: msg.id, result: result === undefined ? null : result }),
        (err) => this.write({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(err && err.message || err), data: err && err.stack ? String(err.stack).slice(0, 2000) : undefined } })
      )
      return
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message || "rpc error"), { code: msg.error.code, data: msg.error.data }))
      else p.resolve(msg.result)
    }
  }

  write(msg: any) {
    this.output.write(JSON.stringify(msg) + "\n")
  }

  notify(method: string, params?: any) {
    this.write({ jsonrpc: "2.0", method, params })
  }

  request(method: string, params?: any, timeoutMs = 30000): Promise<any> {
    const id = this.idPrefix ? `${this.idPrefix}${this.nextId += 2}` : (this.nextId += 2)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`)) }, timeoutMs)
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
      this.write({ jsonrpc: "2.0", id, method, params } as RpcRequest)
    })
  }

  rejectAll(reason: string) {
    for (const [, p] of this.pending) p.reject(new Error(reason))
    this.pending.clear()
  }

  log(line: string) { process.stderr.write("[ext-host] " + line + "\n") }
}
