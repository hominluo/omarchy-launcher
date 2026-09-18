// Remote images are fetched by the sidecar (image.fetch): bounded, sniffed,
// cached as files the shell loads from disk. Anything that is not a small
// raster image is an error, never a file.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const zlib = require("node:zlib")
const { startHost } = require("./ext-host.js")

function png(width = 2, height = 2) {
  const crc = (buf) => { let c = ~0 >>> 0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 } return (~c) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

test("image.fetch caches real images and refuses everything else", async () => {
  let hits = 0
  const image = png()
  const server = http.createServer((req, res) => {
    hits++
    if (req.url === "/a.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(image); return }
    if (req.url === "/page") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>nope</html>"); return }
    if (req.url === "/big-declared") { res.writeHead(200, { "content-type": "image/png", "content-length": String(3 * 1024 * 1024) }); res.end(image); return }
    if (req.url === "/big-chunked") { res.writeHead(200, { "content-type": "image/png" }); const buf = Buffer.alloc(1024 * 1024, 0x41); res.write(image); for (let i = 0; i < 3; i++) res.write(buf); res.end(); return }
    res.writeHead(404); res.end()
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const base = `http://127.0.0.1:${server.address().port}`
  const host = startHost()
  try {
    await host.hello
    await host.request("manager.hello", { protocol: 1, capabilities: {} })
    const r = await host.request("image.fetch", { url: base + "/a.png" })
    assert.ok(r.path.startsWith(path.join(host.home, ".cache", "omarchy-launcher", "images")), r.path)
    assert.ok(r.path.endsWith(".png"))
    assert.equal(fs.statSync(r.path).mode & 0o777, 0o600)
    assert.ok(fs.readFileSync(r.path).equals(image))
    const again = await host.request("image.fetch", { url: base + "/a.png" })
    assert.equal(again.path, r.path)
    assert.equal(hits, 1, "the second request must be served from the cache")
    await assert.rejects(host.request("image.fetch", { url: base + "/page" }), /not an image/)
    await assert.rejects(host.request("image.fetch", { url: base + "/big-declared" }), /too large/)
    await assert.rejects(host.request("image.fetch", { url: base + "/big-chunked" }), /too large/)
    await assert.rejects(host.request("image.fetch", { url: "file:///etc/passwd" }), /bad scheme/)
    await assert.rejects(host.request("image.fetch", { url: "data:image/png;base64,AAAA" }), /bad scheme/)
    const files = fs.readdirSync(path.join(host.home, ".cache", "omarchy-launcher", "images"))
    assert.equal(files.length, 1, "only the real image was cached: " + files)
  } finally { host.stop(); server.close() }
})
