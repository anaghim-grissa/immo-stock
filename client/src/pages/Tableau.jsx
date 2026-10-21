import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dt, date, TYPES_PLURIEL } from '../format.js';
import { EtatEcheance, Modal } from '../components/ui.jsx';

export default function Tableau({ go }) {
  const [stats, setStats] = useState(null);
  const [alertes, setAlertes] = useState([]);
  const [relance, setRelance] = useState(null);

  const load = () => {
    api('/stats').then(setStats);
    api('/alertes').then(setAlertes);
  };
  useEffect(load, []);

  if (!stats) return <p className="muted">Chargement…</p>;
  const retard = alertes.filter((a) => a.etat === 'retard');
  const proche = alertes.filter((a) => a.etat === 'proche');

  return (
    <div className="stack">
      {retard.length > 0 && (
        <section className="alert-band" role="alert">
          <div>
            <strong>{retard.length} échéance{retard.length > 1 ? 's' : ''} impayée{retard.length > 1 ? 's' : ''} en retard</strong>
            <span> · {dt(stats.montant_retard)} à recouvrer</span>
          </div>
          <a href="#alertes" className="link-on-band">Voir la liste</a>
        </section>
      )}

      <section className="kpis">
        <div className="kpi"><span>Encaissé</span><strong>{dt(stats.encaisse)}</strong></div>
        <div className="kpi"><span>Reste à encaisser</span><strong>{dt(stats.reste_a_encaisser)}</strong></div>
        <div className={`kpi ${stats.nb_retard ? 'danger' : ''}`}><span>En retard</span><strong>{dt(stats.montant_retard)}</strong></div>
        <div className="kpi"><span>Dues sous 7 jours</span><strong>{stats.nb_proche}</strong></div>
      </section>

      <section className="card">
        <h2>Disponibilité du stock</h2>
        <div className="stock-summary">
          {Object.entries(TYPES_PLURIEL).map(([type, label]) => {
            const s = stats.parType[type] || { total: 0, disponible: 0, reserve: 0, vendu: 0, bloque: 0 };
            return (
              <button key={type} className="stock-row" onClick={() => go('stock', { type })}>
                <span className="stock-label">{label}</span>
                <span className="bar">
                  {['vendu', 'reserve', 'bloque', 'disponible'].map((k) => (
                    <span key={k} className={`seg seg-${k}`} style={{ flexGrow: s[k] }} title={`${k} : ${s[k]}`} />
                  ))}
                </span>
                <span className="stock-nums"><b>{s.disponible}</b> dispo. / {s.total}</span>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span><i className="seg-vendu" />Vendu</span><span><i className="seg-reserve" />Réservé</span>
          <span><i className="seg-bloque" />Bloqué</span><span><i className="seg-disponible" />Disponible</span>
        </div>
      </section>

      <section className="card" id="alertes">
        <h2>Alertes d'échéances</h2>
        {alertes.length === 0 ? (
          <p className="muted">Aucune échéance en retard ni due dans les 7 prochains jours.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Client</th><th>Lots</th><th>Échéance</th><th>Date</th><th className="num">Reste dû</th><th>État</th><th>Dernière relance</th><th /></tr>
              </thead>
              <tbody>
                {[...retard, ...proche].map((a) => (
                  <tr key={a.id} className={a.etat === 'retard' ? 'row-danger' : ''}>
                    <td><button className="link" onClick={() => go('ventes', { venteId: a.vente_id })}>{a.client_nom}</button><div className="muted small">{a.client_tel}</div></td>
                    <td className="mono">{a.lots.join(', ')}</td>
                    <td>{a.libelle}</td>
                    <td>{date(a.date_echeance)}</td>
                    <td className="num">{dt(a.reste)}</td>
                    <td><EtatEcheance e={a} /></td>
                    <td className="muted">{a.derniere_relance ? date(a.derniere_relance) : '—'}</td>
                    <td>{a.etat === 'retard' && <button className="secondary sm" onClick={() => setRelance(a)}>Relancer</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {relance && <Relance alerte={relance} onClose={() => { setRelance(null); load(); }} />}
    </div>
  );
}

function Relance({ alerte, onClose }) {
  const [texte, setTexte] = useState(alerte.message);
  const [info, setInfo] = useState('');
  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); setInfo('Message copié. Collez-le dans un SMS ou WhatsApp.'); }
    catch { setInfo('Copie impossible : sélectionnez le texte manuellement.'); }
  };
  const envoyer = async () => {
    const r = await api(`/alertes/${alerte.id}/relancer`, { method: 'POST' });
    setInfo([
      r.envoye ? 'Email de relance envoyé au client.' : "Relance enregistrée, mais l'envoi d'emails n'est pas configuré sur le serveur (voir README).",
      ...(r.erreurs || []).map((e) => `Échec ${e}`),
    ].join(' '));
  };
  return (
    <Modal title={`Relancer ${alerte.client_nom}`} onClose={onClose}>
      <p className="muted small">Tél. {alerte.client_tel || '—'} · {alerte.client_email || 'pas d’email'}</p>
      <textarea id="relance-texte" rows={10} value={texte} onChange={(e) => setTexte(e.target.value)} />
      {info && <p className="info">{info}</p>}
      <div className="actions">
        <button className="secondary" onClick={copier}>Copier le message</button>
        <button className="primary" onClick={envoyer}>Envoyer par email</button>
      </div>
    </Modal>
  );
}
