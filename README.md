# xiangqi-replay · 中国象棋复盘工具

> 纯前端中国象棋复盘工具，支持棋谱管理、PGN 导入导出、磁盘文件覆盖保存。零构建工具，打开即用。

## 功能特性

- **完整象棋规则**：棋盘状态管理、走法生成、合法性校验、将军/将死检测
- **棋谱树管理**：支持变着、回退、重做，非线性的走法树结构
- **PGN 导入导出**：标准 PGN 格式序列化与反序列化，支持 FEN 初始局面
- **本地棋谱库**：基于 localStorage 的 CRUD，按对局唯一 ID 管理，更新不新建副本
- **磁盘文件绑定**：基于 File System Access API + IndexedDB，一盘对局绑定一个磁盘 `.pgn` 文件，后续保存直接覆盖同一文件，不再生成下载副本
- **布置模式**：自由摆放棋子，自定义初始局面
- **Canvas 绘制**：古典木质棋盘风格，响应式自适应视口，无滚动条

## 技术栈

- 纯原生 HTML / CSS / JavaScript（ES Modules），零依赖、零构建
- Canvas 2D API 绘制棋盘与棋子
- localStorage 持久化棋谱库
- IndexedDB 持久化 FileSystemFileHandle 绑定关系
- File System Access API 直接读写本地文件

## 快速开始

直接用浏览器打开 `index.html` 即可，无需安装任何依赖。

推荐使用 **Chrome** 或 **Edge** 以获得磁盘文件覆盖保存功能。

## 文件结构

```
xiangqi-replay/
├── index.html              # 入口页面
├── css/
│   └── style.css           # 样式（古典木质棋盘 + 响应式布局）
├── js/
│   ├── xiangqi-game.js     # 核心规则：棋盘、走法、合法性、PGN/FEN、棋谱树
│   ├── xiangqi-board.js    # Canvas 绘图 + 交互 + 磁盘文件绑定逻辑
│   ├── storage.js          # localStorage 棋谱库 CRUD
│   └── file-handle-store.js # IndexedDB + File System Access API 封装
└── assets/
    └── pieces/             # 棋子图片素材
```

## 快捷键

| 按键 | 功能 |
|------|------|
| 鼠标点击 | 选子 / 走子 |
| `←` / `→` | 上一步 / 下一步 |
| `Home` / `End` | 跳到开头 / 结尾 |
| `Ctrl+S` | 保存棋谱（首次弹出文件选择器，之后直接覆盖） |
| `Ctrl+O` | 导入 PGN 文件 |
| `R` | 重新开局 |
| `S` | 进入/退出布置模式 |
| `L` | 打开/关闭棋谱库面板 |

## 磁盘文件绑定机制

每盘对局有一个唯一的 UUID（`libraryId`），在 IndexedDB 中与用户选择的磁盘文件句柄（`FileSystemFileHandle`）持久绑定：

```
libraryId (UUID)  ──IndexedDB──►  FileSystemFileHandle + pathHint
       ▲                                      ▲
       │                                      │
  localStorage 棋谱库条目              磁盘上的 .pgn 文件
```

- 首次 `Ctrl+S` 弹出「另存为」，选定路径后永久绑定
- 后续保存直接覆写磁盘同一文件，浏览器不触发下载，无 `(1)(2)` 副本
- 刷新页面 / 重开浏览器后载入该对局，绑定关系自动恢复

## 兼容性

| 浏览器 | 磁盘覆盖保存 | 备注 |
|--------|:---:|------|
| Chrome / Edge | 支持 | 完整功能 |
| Firefox | 不支持 | 回退为传统下载，会产生副本文件 |
| Safari | 不支持 | 回退为传统下载 |

## 许可证

MIT
