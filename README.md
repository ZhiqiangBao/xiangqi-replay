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

## 本地运行

```bash
python server.py
```

浏览器会自动打开，按 `Ctrl+C` 停止。

---

## 引擎分析（皮卡鱼 NNUE）

本项目支持接入 [皮卡鱼（Pikafish）](https://github.com/official-pikafish/Pikafish) 引擎进行局面评估。皮卡鱼是基于 NNUE 权重的中国象棋引擎，评估精度远超传统子力价值表。

### 快速使用

```bash
python engine_server.py
```

浏览器自动打开后，按 `E` 键连接引擎，棋盘左上角会显示：

- **评分**：红方视角的分值（如 `红+2.30` 表示红方优势约 2 个兵）
- **最佳走法**：绿色箭头标注引擎推荐走法
- **状态**：连接 / 分析中 / 已就绪

### 引擎工作原理

```
浏览器 (fetch POST /api/evaluate {fen})
        ↓
engine_server.py (Python HTTP 服务)
        ↓ UCI 协议 (stdin/stdout)
pikafish.exe (C++ 引擎)
        ↓ 加载
pikafish.nnue (53MB NNUE 权重文件)
```

引擎通过 UCI 协议与 Python 服务通信：
1. 发送 `position fen <当前局面>`
2. 发送 `go depth 15`（搜索深度 15 层）
3. 解析 `info score cp <分值>` 和 `bestmove <走法>`
4. 返回 JSON 给前端显示

### 安装皮卡鱼

如果 `engine_server.py` 提示「未找到 pikafish.exe」，按以下步骤操作：

> **重要**：皮卡鱼是 **CPU 引擎**（NNUE 跑在 CPU 上），跟**显卡（GPU）无关**。选版本看的是 **CPU 指令集**，不是显卡型号。

**第一步：下载皮卡鱼完整包**

打开 [皮卡鱼官网](http://pikafish.com) 或 [GitHub Releases](https://github.com/official-pikafish/Pikafish/releases/latest)，下载一个完整压缩包。**一个压缩包里就包含了所有 CPU 指令集对应的引擎可执行文件**，不用按指令集分别下载。

解压后 Windows 部分的目录结构如下：

```
皮卡鱼 20260131/
├── pikafish-vnni512.exe        ← 性能从高到低
├── pikafish-avx512icl.exe         （不支持就崩溃，往下选）
├── pikafish-avx512.exe
├── pikafish-avxvnni.exe        ⭐ 12/13/14 代 Intel 必选
├── pikafish-bmi2.exe
├── pikafish-avx2.exe
├── pikafish-sse41-popcnt.exe   ← 老电脑兜底
├── pikafish.nnue                ← NNUE 权重（所有 exe 共用，约 53MB）
├── Linux/                       ← Linux 各指令集版本
├── MacOS/
├── Android/
└── 更新日志.txt / 引擎介绍.txt 等
```

> **关键**：7 个 `pikafish-*.exe` **只能选一个**放进 `nnue/`，不能全塞进去。本项目的 `engine_server.py` 会按性能优先级自动选择，如果 `nnue/` 里同时有 `vnni512` 和 `avxvnni`，会优先选 `vnni512`，但你的 CPU 不支持就会启动崩溃。

**第二步：根据 CPU 选一个 exe**

按下表对应自己的 CPU 选一个（性能从高到低，不支持就往下选）：

| 文件名 | 指令集 | Intel CPU | AMD CPU |
|---|---|---|---|
| `pikafish-vnni512.exe` | AVX-512 VNNI | Ice Lake (10代) / Xeon Cascade Lake 及以上 | Zen 4 (Ryzen 7000) 及以上 |
| `pikafish-avx512icl.exe` | AVX-512 ICX | Ice Lake (10代) / Xeon Ice Lake 及以上 | Zen 4 (Ryzen 7000) 及以上 |
| `pikafish-avx512.exe` | AVX-512 F/CD/BW/VL | Skylake-X (HEDT) 及以上 | Zen 4 (Ryzen 7000) 及以上 |
| `pikafish-avxvnni.exe` | AVX-VNNI | **Tiger Lake (11代) 及以上** ⭐ 12/13/14 代必选 | Zen 3 (Ryzen 5000) 及以上 |
| `pikafish-bmi2.exe` | BMI2 | Haswell (4代) 及以上 | Zen 3 (Ryzen 5000) 及以上 |
| `pikafish-avx2.exe` | AVX2 | Haswell (4代, 2013) 及以上 | Zen 1 (Ryzen 1000) 及以上 |
| `pikafish-sse41-popcnt.exe` | SSE4.1 + POPCNT | Core 2 Duo (2008) 之后基本都有 | Bulldozer 及以上 |

> **常见误区**：12 代 (Alder Lake) 及以上的 Intel **客户端** CPU **不支持 AVX-512 / VNNI512**（大小核架构砍掉了），必须选 **`pikafish-avxvnni.exe`**。例如 i5-13500HX、i7-12700H、i9-14900K 都属于这类。

### 如何查看自己的 CPU 支持哪种指令集

**方法一：一行命令（推荐）**

打开 PowerShell，执行：

```powershell
Get-CimInstance Win32_Processor | Select-Object Name
```

看输出的 CPU 型号，对照上表选版本。例如：

```
Name
----
13th Gen Intel(R) Core(TM) i5-13500HX
```

→ 13 代 Intel 客户端 CPU，查表 → 选 **`pikafish-avxvnni.exe`**。

**方法二：CPU-Z / HWiNFO**

下载 [CPU-Z](https://www.cpuid.com/softwares/cpu-z.html) 或 [HWiNFO](https://www.hwinfo.com/)，打开后看 **Instructions** 一栏，会列出 `AVX2`、`AVX-512`、`AVX-VNNI`、`BMI2` 等具体支持的指令集。

**方法三：照型号推算**

| 你的 CPU | 推荐文件 |
|---|---|
| Intel 12/13/14 代酷睿（型号含 `12xx`/`13xx`/`14xx`）| `pikafish-avxvnni.exe` |
| Intel 11 代酷睿（型号含 `11xx`）| `pikafish-avxvnni.exe` |
| Intel 10 代及以下酷睿 | `pikafish-avx2.exe` 或 `pikafish-bmi2.exe` |
| Intel Xeon (服务器，2019+) | `pikafish-vnni512.exe` 或 `pikafish-avx512.exe` |
| AMD Ryzen 7000+ / 9000+ | `pikafish-vnni512.exe` 或 `pikafish-avx512.exe` |
| AMD Ryzen 5000 | `pikafish-avxvnni.exe` 或 `pikafish-bmi2.exe` |
| AMD Ryzen 3000 及以下 | `pikafish-avx2.exe` |
| 不确定 / 十年前的老电脑 | `pikafish-sse41-popcnt.exe` 兜底 |

> **试错法**：选错了也没关系，引擎一启动就崩溃退出（无报错弹窗，只是 `engine_server.py` 显示「引擎启动失败」），换一个 exe 即可。

**第三步：放入 `nnue/` 文件夹**

从解压目录里拷贝**两个文件**到项目根目录的 `nnue/` 文件夹：
- 你选中的那一个 `pikafish-*.exe`（约 1.5MB）
- `pikafish.nnue`（NNUE 权重，约 53MB，所有 exe 共用）

```
xiangqi-replay/
├── engine_server.py
├── nnue/                        ← 新建这个文件夹
│   ├── pikafish-avxvnni.exe     ← 你选的那一个（约 1.5MB）
│   └── pikafish.nnue            ← NNUE 权重（约 53MB）
```

> **注意**：不要把多个 `pikafish-*.exe` 都放进来，只能放一个。`pikafish.nnue` 文件名不要改。

**第四步：重新运行**

```bash
python engine_server.py
```

看到 `正在启动皮卡鱼引擎` 和 `引擎已就绪` 即安装成功。

> **说明**：引擎功能仅在本地运行时可用，GitHub Pages 在线版无法连接本地引擎。

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
| `E` | 连接 / 断开皮卡鱼引擎 |

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
│   ├── xiangqi-board.js         # Canvas 绘图 · 交互 · 磁盘文件绑定 · 引擎评估显示
│   ├── storage.js               # localStorage 棋谱库 CRUD
│   └── file-handle-store.js     # IndexedDB + File System Access API 封装
├── server.py                    # 本地静态文件服务器
├── engine_server.py             # 本地服务器 + 皮卡鱼引擎分析服务
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

## 许可证

[MIT](LICENSE)
