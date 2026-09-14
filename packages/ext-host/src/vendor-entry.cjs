// The third-party React runtime, bundled separately (and minified) so the
// launcher's own sidecar code stays a small, readable file. ext-host.js
// resolves `react`, `react-reconciler` and friends to this module at
// build time (see build.mjs).
module.exports = {
  "react": require("react"),
  "react/jsx-runtime": require("react/jsx-runtime"),
  "react/jsx-dev-runtime": require("react/jsx-dev-runtime"),
  "react-reconciler": require("react-reconciler"),
  "react-reconciler/constants": require("react-reconciler/constants"),
  "scheduler": require("scheduler")
}
