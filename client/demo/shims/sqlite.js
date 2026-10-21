// Remplace node:sqlite par sql.js (SQLite compilé en JavaScript) pour la démo navigateur.
// L'attente de haut niveau garantit que la base est prête avant que server/src/db.js ne s'exécute.
import initSqlJs from 'sql.js/dist/sql-asm.js';

export const DEMO_KEY = 'immo-demo-db';
const SQL = await initSqlJs();
let saved = null;
try {
  const s = localStorage.getItem(DEMO_KEY);
  if (s) saved = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
} catch { /* stockage indisponible : base en mémoire */ }
export const demoState = { isNew: !saved, db: null };

export class DatabaseSync {
  constructor() {
    this.db = new SQL.Database(saved || undefined);
    demoState.db = this.db;
  }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) {
    const db = this.db;
    const clean = (p) => p.map((v) => (v === undefined ? null : v));
    const rows = (params) => {
      const st = db.prepare(sql);
      st.bind(clean(params));
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      st.free();
      return out;
    };
    return {
      all: (...p) => rows(p),
      get: (...p) => rows(p)[0],
      run: (...p) => {
        db.run(sql, clean(p));
        const changes = db.getRowsModified();
        const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        return { changes, lastInsertRowid };
      },
    };
  }
}
