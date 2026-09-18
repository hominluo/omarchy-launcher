"use strict";
// Bypasses the view model entirely: a raw 9 MiB ui.render frame straight
// to the main thread, the way a hostile bundle could.
const { parentPort } = require("node:worker_threads");
const { List } = require("@raycast/api");
const { jsx } = require("react/jsx-runtime");

function Command() {
  setTimeout(() => {
    parentPort.postMessage({ type: "rpc", msg: { jsonrpc: "2.0", method: "ui.render", params: { s: "s1", views: [{ view: "v1", root: { type: "detail", markdown: "X".repeat(9 * 1024 * 1024) } }] } } });
  }, 200);
  return jsx(List, { children: [] });
}
module.exports = { default: Command };
