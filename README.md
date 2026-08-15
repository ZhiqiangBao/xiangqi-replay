<div align="center">

# 中国象棋复盘 · Xiangqi Replay

### 纯前端 · 零依赖 · 零构建 · 打开即用

[![GitHub Pages](https://img.shields.io/badge/🟢_在线试用-zhiqiangbao.github.io-success?style=for-the-badge)](https://zhiqiangbao.github.io/xiangqi-replay/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)
[![No Build](https://img.shields.io/badge/构建工具-无-important?style=for-the-badge)](#)

**[在线体验](https://zhiqiangbao.github.io/xiangqi-replay/) · [功能特性](#-功能特性) · [快捷键](#-快捷键) · [技术架构](#-技术架构)**

</div>

---

> 一盘对局绑定一个独特序列，一个序列对应一个棋谱文件。更新时直接覆盖磁盘，不再生成副本。

<div align="center">

| | |
|:---:|:---:|
| **完整象棋规则** | 走法生成 · 合法性校验 · 将军 / 将死检测 |
| **棋谱树管理** | 支持变着 · 回退 · 重做 · 非线性走法树 |
| **PGN 导入导出** | 标准 PGN 序列化 · FEN 初始局面 · 双向兼容 |
| **本地棋谱库** | localStorage 持久化 · 唯一 ID · 更新不新建副本 |
| **磁盘文件绑定** | File System Access API · 覆盖写同文件 · 零副本 |
| **布置模式** | 自由摆子 · 自定义初始局面 · 一键切换 |
| **Canvas 绘制** | 古典木质风格 · 响应式自适应 · 无滚动条 |

</div>

---

## 在线试用

点击下方按钮直接打开（推荐 **Chrome** 或 **Edge**）：

<div align="center">

### [xiangqi-replay](https://zhiqiangbao.github.io/xiangqi-replay/)

</div>

## 本地运行

> 不能直接双击 `index.html` 打开！项目使用了 ES Modules，浏览器安全策略不允许 `file://` 协议加载。

**最简单的方式 —— Python 一键启动**

项目根目录自带了 `server.py`，它会自动启动服务器并打开浏览器：

```bash
python server.py
```

浏览器会自动弹出，不需要手动输地址。按 `Ctrl+C` 停止。

> 当然，最简单的方式是直接用上面的在线版链接。

---

## 功能特性

### 棋盘与规则

- 完整实现中国象棋全部走法：帅/将、士、相/象、马、车、炮、兵/卒
- 走法生成器 + 合法性校验（飞将、塞马腿、蹩象腿等）
- 将军、将死、困毙自动检测

### 棋谱管理

- **棋谱树**：非线性结构，支持变着分支，可任意回退/重做
- **PGN 导入导出**：标准 PGN 格式，支持 FEN 标签记录初始局面
- **本地棋谱库**：每盘对局一个唯一 UUID，更新时覆盖同一条目，不新建副本

### 磁盘文件绑定（核心特性）

> 一盘对局绑定一个独特的序列（UUID），这个序列在 IndexedDB 中与用户选择的磁盘文件句柄持久绑定。

```
  libraryId (UUID)  ──IndexedDB──►  FileSystemFileHandle + pathHint
       ▲                                      ▲
       │                                      │
  localStorage 棋谱库条目              磁盘上的 .pgn 文件（直接覆写）
```

- 首次 `Ctrl+S` 弹出「另存为」，选定路径后**永久绑定**
- 后续保存直接覆写磁盘同一文件，浏览器不触发下载，**无 `(1)(2)` 副本**
- 刷新页面 / 重开浏览器后载入该对局，绑定关系自动恢复

### 布置模式

- 自由摆放棋子，自定义任意初始局面
- 按 `S` 一键切换布置 / 对局模式

---

## 快捷键

<div align="center">

| 按键 | 功能 |
|:---:|:---|
| 鼠标点击 | 选子 / 走子 |
| `←` `→` | 上一步 / 下一步 |
| `Home` `End` | 跳到开头 / 结尾 |
| `Ctrl` + `S` | 保存棋谱（首次选路径，之后直接覆盖） |
| `Ctrl` + `O` | 导入 PGN 文件 |
| `R` | 重新开局 |
| `S` | 进入 / 退出布置模式 |
| `L` | 打开 / 关闭棋谱库面板 |

</div>

---

## 技术架构

<div align="center">

| 层 | 技术 | 职责 |
|:---|:---|:---|
| **视图层** | Canvas 2D API | 棋盘绘制 · 棋子渲染 · 走法提示 · 交互反馈 |
| **逻辑层** | ES Modules | 规则引擎 · 走法生成 · PGN/FEN 序列化 · 棋谱树 |
| **存储层** | localStorage | 棋谱库 CRUD · 按唯一 ID 管理 |
| **绑定层** | IndexedDB | FileSystemFileHandle 持久化 · 对局-文件绑定关系 |
| **文件层** | File System Access API | 读写本地 .pgn · 覆盖写磁盘 · 权限管理 |

</div>

### 文件结构

```
xiangqi-replay/
├── index.html                  # 入口页面
├── css/
│   └── style.css               # 样式（古典木质棋盘 + 响应式布局）
├── js/
│   ├── xiangqi-game.js          # 核心规则：棋盘 · 走法 · 合法性 · PGN/FEN · 棋谱树
│   ├── xiangqi-board.js         # Canvas 绘图 · 交互 · 磁盘文件绑定逻辑
│   ├── storage.js               # localStorage 棋谱库 CRUD
│   └── file-handle-store.js     # IndexedDB + File System Access API 封装
└── assets/
    └── pieces/                  # 棋子图片素材
```

---

## 兼容性

<div align="center">

| 浏览器 | 磁盘覆盖保存 | 状态 |
|:---|:---:|:---:|
| Chrome / Edge | 支持 | ✅ 完整功能 |
| Firefox | 不支持 | ⚠️ 回退为传统下载，会产生副本文件 |
| Safari | 不支持 | ⚠️ 回退为传统下载 |

</div>

> 磁盘覆盖保存依赖 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)，目前仅 Chromium 内核浏览器支持。Firefox / Safari 下自动回退为传统 `a[download]` 下载，其余功能不受影响。

---

<div align="center">

### 在线体验

[![Open App](https://img.shields.io/badge/打开应用-开始对局-red?style=for-the-badge&logo=googlechrome&logoColor=white)](https://zhiqiangbao.github.io/xiangqi-replay/)

</div>

---

## 许可证

[MIT](LICENSE)
