// Store bundles keep exactly three externals: @raycast/api, react, and
// react/jsx-runtime. Route them to our copies so there is one React in the
// worker, and make unknown API symbols fail loudly instead of as undefined.
import Module from "node:module"

export function patchRequire(api: Record<string, any>) {
  const react = require("react")
  const jsx = require("react/jsx-runtime")
  const proxied = new Proxy(api, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver)
      if (prop === "__esModule") return true
      if (prop === "default" || prop === "then") return undefined
      return () => { throw new Error(`@raycast/api.${String(prop)} is not supported by Omarchy Launcher`) }
    }
  })
  const overrides: Record<string, any> = {
    "react": react,
    "react/jsx-runtime": jsx,
    "react/jsx-dev-runtime": require("react/jsx-dev-runtime"),
    "@raycast/api": proxied,
    "@omarchy-launcher/raycast-api": api
  }
  const original = (Module.prototype as any).require
  ;(Module.prototype as any).require = function (id: string) {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id]
    return original.apply(this, arguments as any)
  }
  // Very old bundles reference the classic JSX runtime globals.
  const g: any = globalThis
  g._jsx = jsx.jsx; g._jsxs = jsx.jsxs; g._jsxFragment = jsx.Fragment
  return proxied
}
