# dsh-todo

一个 DSH（DeepSeek Harness）桌面端插件：在会话标题栏的按钮组最左侧放一枚待办按钮，点开即是一个常驻的待办卡片。

- 按钮轮播显示未办事项（只轮播未完成的，4 秒切换，悬停或展开时暂停）
- 按紧急度整块着色：逾期红 / 24 小时内黄 / 稍后绿 / 全部完成中性
- 卡片内新增、编辑（文字 + 截止时间）、勾选完成、删除、清除已完成
- 按紧急度排序，已完成收进可展开的「已完成 n 项」折叠区
- 快捷截止时间：今天 18:00 / 明天 09:00，也可手选或「不限时间」
- 数据存在浏览器 `localStorage`（`dsh-todo.items.v1`），刷新不丢
- 跟随 DSH 主题（只用 `--dsw-alias-*` token），中英文自动切换

## 安装

插件是一个 Cordis bundle，安装到当前 DSH profile：

```bash
# 在 DSH 会话里调用（或在 profile 上用 plugin_manager 工具）
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

本地开发时用 `link:` 依赖安装，改完文件后在 `plugin_manager` 里把插件禁用再启用即可热重载；重新打包的分支需要刷新页面。

## 目录

```
client.js                 客户端一半：按钮 + 面板（渲染、样式、store）
index.js                  Host 一半（本插件为空）
cordis.patch.yml          bundle 插入声明（entry id: dsh-todo）
package.json              包元数据 + dsh.bundle / dsh.client 声明
locale/en.json, zh.json   插件元数据（标题、描述）
icon.svg                  插件图标
scripts/verify-render.mjs 离线渲染检查（无需浏览器）
```

## 挂载点

| 用途 | Slot | id | order |
| --- | --- | --- | --- |
| 标题栏按钮 | `conversation.session.header.utilities` | `dsh-todo:button` | -20 |
| 浮层卡片 | `shell.overlay` | `dsh-todo:panel` | 900 |

`shell.overlay` 本身是点击穿透的浮层，所以卡片显式 `pointer-events: auto`。

## 验证

没有浏览器也能跑一遍渲染断言（stub 掉 window/document/localStorage 与一个迷你 React）：

```bash
node --check client.js
node scripts/verify-render.mjs      # 40 checks
```

## License

MIT
