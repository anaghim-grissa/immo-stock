// Démo autonome : le serveur Node (routes, règles, base SQLite) tourne dans le navigateur.
import { DEMO_KEY as KEY, demoState } from 'node:sqlite';
import { api } from '../../server/src/routes.js';
import { seed } from '../../server/src/seed-data.js';
import '../src/main.jsx';

const b64 = {
  enc: (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); },
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

function save() {
  try { localStorage.setItem(KEY, b64.enc(demoState.db.export())); } catch { /* stockage indisponible : la démo reste en mémoire */ }
}

function boot() {
  if (demoState.isNew) { seed(); save(); }

  window.__immoDemoFetch = (url, init = {}) => new Promise((resolve) => {
    const method = (init.method || 'GET').toUpperCase();
    const req = {
      method,
      path: url.replace(/^\/api/, ''),
      params: {},
      headers: { authorization: init.headers?.Authorization || '' },
      body: init.body ? JSON.parse(init.body) : {},
    };
    let status = 200;
    const res = {
      status(c) { status = c; return res; },
      json(data) {
        if (method !== 'GET' || req.path === '/auth/login') save();
        resolve({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(data)) });
      },
    };
    api.handle(req, res, () => res.status(404).json({ error: 'Introuvable.' }));
  });

  document.getElementById('demo-reset').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); localStorage.removeItem('immo-token'); } catch { /* ignore */ }
    location.reload();
  });
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const [email, pw] = b.dataset.copy.split('|');
    const e = document.getElementById('login-email'), p = document.getElementById('login-pw');
    if (!e || !p) return;
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(e, email); set(p, pw);
  }));

}

boot();
