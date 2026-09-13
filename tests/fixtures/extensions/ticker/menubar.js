"use strict";
const { MenuBarExtra, Icon, showHUD, open } = require("@raycast/api");
const React = require("react");
const { jsx } = require("react/jsx-runtime");
function Command() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setN((x) => x + 1), 2000); return () => clearInterval(t); }, []);
  return jsx(MenuBarExtra, { icon: Icon.Clock, title: "T" + n, tooltip: "Ticker menu bar", children: [
    jsx(MenuBarExtra.Section, { title: "Counter", children: [
      jsx(MenuBarExtra.Item, { title: "Count is " + n, onAction: () => showHUD("Count " + n) }, "a"),
      jsx(MenuBarExtra.Item, { title: "Reset", onAction: () => setN(0) }, "b")
    ] }, "s1"),
    jsx(MenuBarExtra.Section, { children: [ jsx(MenuBarExtra.Item, { title: "Open Omarchy site", onAction: () => open("https://omarchy.org") }, "c") ] }, "s2")
  ] });
}
module.exports = { default: Command };
