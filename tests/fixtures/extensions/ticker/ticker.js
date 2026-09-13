"use strict";
const { List, ActionPanel, Action, Icon, showToast, Toast, Detail } = require("@raycast/api");
const React = require("react");
const { jsx, jsxs } = require("react/jsx-runtime");

function Command() {
  const [n, setN] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 500);
    setTimeout(() => setLoading(false), 700);
    return () => clearInterval(t);
  }, []);
  return jsx(List, { isLoading: loading, navigationTitle: "Ticker " + n, searchBarPlaceholder: "Filter…", children: [
    jsx(List.Section, { title: "Numbers", children: Array.from({ length: n + 1 }, (_, i) =>
      jsx(List.Item, { key: i, id: "n" + i, title: "Item " + i, subtitle: "sub", icon: Icon.Star, accessories: [{ text: String(i * 2) }, { tag: { value: "tag", color: "raycast-green" } }],
        actions: jsx(ActionPanel, { children: [
          jsx(Action, { title: "Toast", onAction: () => showToast({ style: Toast.Style.Success, title: "Hello " + i }) }, "a"),
          jsx(Action.CopyToClipboard, { content: "copied " + i }, "b"),
          jsx(Action.Push, { title: "Push detail", target: jsx(Detail, { markdown: "# Detail " + i }) }, "c")
        ] })
      })) }, "s")
  ] });
}
module.exports = { default: Command };
