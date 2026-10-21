import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dt } from '../format.js';
import { Modal, Field, ErrorLine } from '../components/ui.jsx';

export default function Clients({ go }) {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [acces, setAcces] = useState(null);
  const load = () => api('/clients').then(setClients);
  useEffect(() => { load(); }, []);

  const list = clients.filter((c) => !q || `${c.nom} ${c.cin} ${c.tel} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="toolbar">
        <input id="clients-q" className="search" placeholder="Rechercher un client (nom, CIN, téléphone)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setEdit({})}>Nouveau client</button>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>CIN</th><th>Téléphone</th><th>Email</th><th className="num">Dossiers</th><th className="num">En retard</th><th>Espace client</th><th /></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={c.montant_retard ? 'row-danger' : ''}>
                <td><b>{c.nom}</b></td>
                <td className="mono">{c.cin || '—'}</td>
                <td>{c.tel || '—'}</td>
                <td>{c.email || '—'}</td>
                <td className="num">{c.nb_ventes ? <button className="link" onClick={() => go('ventes', { clientId: c.id })}>{c.nb_ventes}</button> : 0}</td>
                <td className="num">{c.montant_retard ? <span className="pill ech-retard">{dt(c.montant_retard)}</span> : '—'}</td>
                <td>{c.acces_email ? <span className="pill lot-disponible">Actif</span> : <button className="secondary sm" onClick={() => setAcces(c)}>Créer l'accès</button>}</td>
                <td><button className="ghost sm" onClick={() => setEdit(c)}>Modifier</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="muted">Aucun client.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <ClientForm client={edit} onClose={(c) => { setEdit(null); if (c) load(); }} />}
      {acces && <AccesForm client={acces} onClose={(c) => { setAcces(null); if (c) load(); }} />}
    </div>
  );
}

export function ClientForm({ client, onClose }) {
  const [f, setF] = useState({ nom: '', cin: '', tel: '', email: '', adresse: '', ...client });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (client.id) { await api(`/clients/${client.id}`, { method: 'PUT', body: f }); onClose({ id: client.id }); }
      else onClose(await api('/clients', { method: 'POST', body: f }));
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={client.id ? client.nom : 'Nouveau client'} onClose={() => onClose(null)}>
      <form className="form-grid" onSubmit={save}>
        <Field label="Nom complet"><input id="client-nom" value={f.nom} onChange={set('nom')} required /></Field>
        <Field label="CIN"><input id="client-cin" value={f.cin || ''} onChange={set('cin')} /></Field>
        <Field label="Téléphone"><input id="client-tel" value={f.tel || ''} onChange={set('tel')} placeholder="+216 …" /></Field>
        <Field label="Email"><input id="client-email" type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Adresse"><input id="client-adresse" value={f.adresse || ''} onChange={set('adresse')} /></Field>
        <ErrorLine error={error} />
        <div className="actions full"><span className="spacer" /><button className="primary" type="submit">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

function AccesForm({ client, onClose }) {
  const [email, setEmail] = useState(client.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try { await api(`/clients/${client.id}/acces`, { method: 'POST', body: { email, password } }); onClose(true); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Accès espace client · ${client.nom}`} onClose={() => onClose(false)}>
      <p className="muted small">Le client pourra consulter ses lots, son échéancier et ses paiements. Communiquez-lui ces identifiants.</p>
      <form className="form-grid" onSubmit={save}>
        <Field label="Email de connexion"><input id="acces-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Mot de passe provisoire" hint="6 caractères minimum"><input id="acces-pw" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
        <ErrorLine error={error} />
        <div className="actions full"><span className="spacer" /><button className="primary" type="submit">Créer l'accès</button></div>
      </form>
    </Modal>
  );
}
