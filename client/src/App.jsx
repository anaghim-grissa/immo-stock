import React, { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { Field, ErrorLine } from './components/ui.jsx';
import Tableau from './pages/Tableau.jsx';
import Stock from './pages/Stock.jsx';
import Clients from './pages/Clients.jsx';
import Ventes from './pages/Ventes.jsx';
import Portail from './pages/Portail.jsx';
import Objectifs from './pages/Objectifs.jsx';

const PAGES = [
  ['tableau', 'Tableau de bord', Tableau],
  ['objectifs', 'Objectifs', Objectifs],
  ['stock', 'Stock', Stock],
  ['ventes', 'Ventes & échéances', Ventes],
  ['clients', 'Clients', Clients],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(() => location.hash.slice(1) || 'tableau');
  const [nav, setNav] = useState({});

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('immo-logout', out);
    if (getToken()) api('/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener('immo-logout', out);
  }, []);

  const go = (p, params = {}) => {
    setPage(p);
    setNav(params);
    history.replaceState(null, '', `#${p}`);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  };

  if (!ready) return null;
  if (!user) return <Login onLogin={setUser} />;

  const Current = (PAGES.find(([k]) => k === page) || PAGES[0])[2];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Résidence · Stock</strong>
            <small>{user.role === 'admin' ? 'Espace société' : 'Espace client'}</small>
          </div>
        </div>
        {user.role === 'admin' && (
          <nav className="tabs">
            {PAGES.map(([k, label]) => (
              <button key={k} className={k === page ? 'active' : ''} onClick={() => go(k)}>{label}</button>
            ))}
          </nav>
        )}
        <div className="who">
          <span>{user.nom || user.email}</span>
          <button className="ghost" onClick={logout}>Déconnexion</button>
        </div>
      </header>
      <main className="content">
        {user.role === 'admin' ? <Current go={go} nav={nav} /> : <Portail />}
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark big" aria-hidden="true" />
        <h1>Résidence · Stock</h1>
        <p className="muted">Appartements, celliers, places de parking et suivi des échéances.</p>
        <Field label="Email"><input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Mot de passe"><input id="login-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorLine error={error} />
        <button className="primary" type="submit">Se connecter</button>
        <p className="muted small">Société et clients utilisent la même page : chacun voit son propre espace.</p>
      </form>
    </div>
  );
}
