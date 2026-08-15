const StorageManager = {
  settings: {
    getSaveDir() {
      try {
        return localStorage.getItem('xiangqi_save_dir') || '';
      } finally {
      }
    },
    setSaveDir(dir) {
      try {
        localStorage.setItem('xiangqi_save_dir', dir || '');
      } finally {
      }
    },
    getSettings() {
      try {
        const raw = localStorage.getItem('xiangqi_settings');
        if (raw) {
          const obj = JSON.parse(raw);
          return Object.assign({ saveDir: '', customDir: '', useCustomDir: false }, obj);
        }
      } finally {
      }
      return { saveDir: '', customDir: '', useCustomDir: false };
    },
    saveSettings(obj) {
      try {
        localStorage.setItem('xiangqi_settings', JSON.stringify(obj));
      } finally {
      }
    }
  },

  library: {
    KEY_PREFIX: 'xiangqi_game_',

    generateFilename({ result = '未分胜负' } = {}) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      return `${result}_${y}-${m}-${d}_${hh}-${mm}-${ss}.pgn`;
    },

    _parsePgnHead(pgn) {
      const head = { Event: '', Date: '', Red: '', Black: '', Result: '', length: 0 };
      const tagRe = /\[(\w+)\s+"([^"]*)"\]/g;
      let m;
      while ((m = tagRe.exec(pgn)) !== null) {
        const key = m[1];
        if (key in head) head[key] = m[2];
      }
      const body = pgn.replace(/\[[^\]]*\]/g, '');
      const moves = body.match(/\b[a-zA-Z]\d+\b/g) || [];
      head.length = moves.length;
      return head;
    },

    _uuid() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    },

    listGames() {
      const games = [];
      try {
        const prefix = this.KEY_PREFIX;
        const metaSuffix = '::meta';
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix) && !k.endsWith(metaSuffix)) {
            keys.push(k);
          }
        }
        for (const k of keys) {
          const id = k.slice(prefix.length);
          const metaKey = k + metaSuffix;
          let filename = '', modified = 0;
          try {
            const metaRaw = localStorage.getItem(metaKey);
            if (metaRaw) {
              const meta = JSON.parse(metaRaw);
              filename = meta.filename || '';
              modified = meta.modified || 0;
            }
          } finally {
          }
          const pgn = localStorage.getItem(k) || '';
          const pgnHead = this._parsePgnHead(pgn);
          games.push({ id, filename, modified, pgnHead });
        }
      } finally {
      }
      games.sort((a, b) => b.modified - a.modified);
      return games;
    },

    saveGame(pgn, filename) {
      const fname = filename || this.generateFilename();
      const id = this._uuid();
      const prefix = this.KEY_PREFIX;
      try {
        localStorage.setItem(prefix + id, pgn);
        const meta = { filename: fname, modified: Date.now(), id };
        localStorage.setItem(prefix + id + '::meta', JSON.stringify(meta));
      } finally {
      }
      return { id, filename: fname };
    },

    loadGame(id) {
      try {
        return localStorage.getItem(this.KEY_PREFIX + id);
      } finally {
      }
    },

    deleteGame(id) {
      try {
        localStorage.removeItem(this.KEY_PREFIX + id);
        localStorage.removeItem(this.KEY_PREFIX + id + '::meta');
      } finally {
      }
    },

    renameGame(id, newName) {
      const metaKey = this.KEY_PREFIX + id + '::meta';
      try {
        const metaRaw = localStorage.getItem(metaKey);
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          meta.filename = newName;
          meta.modified = Date.now();
          localStorage.setItem(metaKey, JSON.stringify(meta));
        }
      } finally {
      }
    }
  },

  fileIO: {
    exportAsDownload(pgn, filename) {
      const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        if (!file || !(file instanceof File)) {
          reject(new Error('无效的文件对象'));
          return;
        }
        file.text().then(text => {
          resolve(text);
        }).catch(err => {
          reject(new Error('读取文件失败: ' + (err.message || err)));
        });
      });
    }
  }
};

export default StorageManager;
