// 对局（libraryId） ↔ File System Access API 的 FileSystemFileHandle 的持久化绑定存储。
// 目的：同一盘棋反复 Ctrl+S / 自动保存时，直接覆盖磁盘上用户最初选定的同一个 .pgn 文件，
//      不再触发浏览器每次下载 (1) (2) 副本。
//
// 兼容性：
//   - Chrome / Edge 86+ 支持 File System Access API → 走「选路径 → 持久绑定 → 覆盖同文件」。
//   - Firefox / Safari 无此 API → 仍走传统 a[download] 下载（浏览器会自动加 (1) 不可避免）。

const DB_NAME = 'xiangqi_file_handles_v1';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

function _idb(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB error'));
  });
}

function _openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'libraryId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB open failed'));
  });
}

const FileHandleStore = {
  SUPPORTS_NATIVE_FILE_SYSTEM: typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function',

  async put(libraryId, record) {
    if (!libraryId) return;
    const db = await _openDB();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await _idb(store.put(Object.assign({ libraryId, updatedAt: Date.now() }, record || {})));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('tx error'));
        tx.onabort = () => reject(tx.error || new Error('tx abort'));
      });
    } finally {
      db.close();
    }
  },

  async get(libraryId) {
    if (!libraryId) return null;
    const db = await _openDB();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const rec = await _idb(store.get(libraryId));
      return rec || null;
    } finally {
      db.close();
    }
  },

  async delete(libraryId) {
    if (!libraryId) return;
    const db = await _openDB();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await _idb(store.delete(libraryId));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('tx error'));
      });
    } finally {
      db.close();
    }
  },

  async suggestFilename() {
    // 仅作为后备，文件名真正生成走 StorageManager.library.generateFilename
    return 'chess.pgn';
  },

  // 把 FileSystemFileHandle 写入到磁盘文件（覆盖），返回 { pathHint, ok: true, size }
  // 若 handle 已不存在权限或抛出异常，返回 { ok:false, reason }，并由调用方决定是否 showSaveFilePicker 重新绑定。
  async writePGNToBoundHandle(handle, pgn) {
    try {
      if (!handle || typeof handle.createWritable !== 'function') {
        return { ok: false, reason: 'invalid-handle' };
      }
      // 请求权限（若用户最初授予了持久权限，这里不会弹窗；若权限过期会弹出一次性询问）
      if (typeof handle.queryPermission === 'function') {
        const opts = { mode: 'readwrite' };
        let state = await handle.queryPermission(opts);
        if (state !== 'granted') state = await handle.requestPermission(opts);
        if (state !== 'granted') return { ok: false, reason: 'permission-denied' };
      }
      const writable = await handle.createWritable({ keepExistingData: false });
      try {
        await writable.write(new Blob([pgn], { type: 'text/plain;charset=utf-8' }));
      } finally {
        await writable.close();
      }
      let pathHint = handle.name || 'PGN file';
      if (typeof handle.getFile === 'function') {
        try {
          const f = await handle.getFile();
          pathHint = f.name || pathHint;
          return { ok: true, pathHint, size: f.size };
        } catch (e) {
          return { ok: true, pathHint, size: pgn.length };
        }
      }
      return { ok: true, pathHint, size: pgn.length };
    } catch (e) {
      return { ok: false, reason: (e && e.name) || 'write-error', message: (e && e.message) || String(e) };
    }
  },

  // 用户手势下弹出「另存为」选择：保存成 PGN，成功则返回 { handle, pathHint, size, ok:true }
  async pickPGNSaveFile(suggestedName) {
    if (!this.SUPPORTS_NATIVE_FILE_SYSTEM) {
      return { ok: false, reason: 'unsupported' };
    }
    try {
      const types = [
        {
          description: 'Portable Game Notation (Xiangqi PGN)',
          accept: { 'text/plain': ['.pgn', '.txt'] },
        },
      ];
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName || this.suggestFilename(),
        types,
        excludeAcceptAllOption: false,
      });
      // 不写内容，仅返回 handle：调用方写入一次（避免重复 writable 调用）
      let pathHint = handle.name || suggestedName || 'chess.pgn';
      return { ok: true, handle, pathHint };
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'UserAbortError' || /cancel|abort/i.test(e.message || ''))) {
        return { ok: false, reason: 'user-canceled' };
      }
      return { ok: false, reason: (e && e.name) || 'picker-error', message: (e && e.message) || String(e) };
    }
  },
};

export default FileHandleStore;
