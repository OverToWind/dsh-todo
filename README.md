# dsh-todo

<img src="assets/icon-180.png" width="72" height="72" alt="dsh-todo icon" align="left" hspace="12" vspace="4">

A to-do list for DeepSeek Harness (DSH): one button in the session header, one floating panel
behind it. Ships as a Cordis bundle plugin for the DSH web UI.

<br clear="left">

## Features

- **Header ticker** — the button cycles through unfinished items every 4 s and pauses while hovered
  or while the panel is open. Completed items never enter the rotation.
- **Urgency tinting** — the whole button is tinted by due time: overdue red, within 24 h amber,
  later green, everything done neutral. The same colours mark each row in the panel.
- **Persistent panel** — add, edit (text and deadline), tick off, delete, clear completed. Rows are
  sorted by urgency, and the finished ones collapse into a `Done (n)` section.
- **Quick deadlines** — `Today` / `Tomorrow` chips (18:00 today, 09:00 tomorrow), a datetime picker,
  or no deadline at all.
- **Local persistence** — items live in `localStorage` (`dsh-todo.items.v1`), so a reload keeps them.
- **Theme-native** — every colour is a `--dsw-alias-*` token, so light and dark follow DSH. UI text is
  English or Chinese depending on the host locale.

## Install

```bash
# from GitHub
dsh plugin --profile <profile> add github:OverToWind/dsh-todo
```

Or, inside a DSH session, install a local clone with
`plugin_manager action=install_bundle target=<path to a local clone>`.
Restart or refresh after installing. The plugin registers no host-side services; the client half
owns all rendering.

## Mount points

| Purpose | Slot | id | order |
| --- | --- | --- | --- |
| Header button | `conversation.session.header.utilities` | `dsh-todo:button` | -20 |
| Floating panel | `shell.overlay` | `dsh-todo:panel` | 900 |

`shell.overlay` is a click-through layer, so the card opts back into pointer events explicitly.

## Layout

```
client.js                  client half: store, button, panel, styles
index.js                   host half (empty for this plugin)
cordis.patch.yml           bundle insert declaration (entry id: dsh-todo)
package.json               package metadata + dsh.bundle / dsh.client
locale/en.json, zh.json    plugin display metadata
icon.svg, assets/          artwork (SVG source + 180x180 PNG for storefronts)
scripts/verify-render.mjs  headless render assertions
scripts/make-icon.py       regenerates assets/icon-180.png from the icon geometry
```

## Verify

No browser required — the harness stubs `window`/`document`/`localStorage` plus a minimal React and
asserts the rendered trees:

```bash
node --check client.js
node scripts/verify-render.mjs     # 40 checks
```

## 中文说明

DSH 会话标题栏里的待办清单：

- **按钮轮播**：每 4 秒切换一条未完成事项，鼠标悬停或面板展开时暂停，已完成的不参与轮播。
- **紧急度着色**：逾期红、24 小时内黄、稍后绿、全部完成时中性；面板里的每一行同样着色。
- **常驻面板**：新增、编辑（文字与截止时间）、勾选、删除、清除已完成；按紧急度排序，已完成收进
  「已完成 n 项」折叠区。
- **快捷截止时间**：「今天」18:00、「明天」09:00、手选时间，或「不限时间」。
- **本地持久化**：数据存在 `localStorage`（`dsh-todo.items.v1`），刷新不丢。
- **跟随主题**：只使用 `--dsw-alias-*` token，中英文按宿主语言自动切换。

安装：`dsh plugin --profile <profile> add github:OverToWind/dsh-todo`，或在 DSH 会话里用
`plugin_manager action=install_bundle target=<本地仓库路径>`。

## License

MIT
