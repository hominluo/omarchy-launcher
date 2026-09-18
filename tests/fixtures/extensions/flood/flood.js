"use strict";
// 150 sections of 40 items (6000 rows), a 1 MiB markdown detail, an https
// icon and a 5000-character title: everything the view model must bound.
const { List, Detail, ActionPanel, Action } = require("@raycast/api");
const { jsx } = require("react/jsx-runtime");

function Command() {
  const sections = [];
  for (let s = 0; s < 150; s++) {
    const items = [];
    for (let i = 0; i < 40; i++) {
      const n = s * 40 + i;
      // The first row carries the oversized fields; the rest only add up.
      const heavy = n === 0
      items.push(jsx(List.Item, { key: n, id: "n" + n, title: heavy ? "T".repeat(5000) : "Item " + n, subtitle: "sub",
        icon: "https://example.invalid/icon.png",
        keywords: heavy ? Array.from({ length: 100 }, (_, k) => "k" + k) : [],
        accessories: heavy ? Array.from({ length: 20 }, (_, k) => ({ text: "a" + k })) : [],
        detail: heavy ? jsx(List.Item.Detail, { markdown: "M".repeat(1024 * 1024) }) : undefined,
        actions: heavy ? jsx(ActionPanel, { children: Array.from({ length: 300 }, (_, k) => jsx(Action, { title: "Act " + k, onAction: () => {} }, "a" + k)) }) : undefined
      }));
    }
    sections.push(jsx(List.Section, { key: s, title: "Section " + s, children: items }));
  }
  return jsx(List, { isShowingDetail: true, children: sections });
}
module.exports = { default: Command };
