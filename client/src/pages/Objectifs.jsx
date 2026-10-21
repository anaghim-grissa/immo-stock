import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dt, date, today, TYPES } from '../format.js';
import { ErrorLine } from '../components/ui.jsx';

const nomMois = (m, court = false) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString('fr-FR', court ? { month: 'short' } : { month: 'long', year: 'numeric' });
const decaler = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};

export default function Objectifs({ go }) {
  const [mois, setMois] = useState(today().slice(0, 7));
  const [data, setData] = useState(null);
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [error, setError] = useState('');

  const load = () => api(`/objectifs?mois=${mois}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [mois]);

  const enregistrer = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api(`/objectifs/${mois}`, { method: 'PUT', body: { appartements: Number(saisie) } });
      setEdition(false);
      load();
    } catch (err) { setError(err.message); }
  };

  const courant = mois === today().slice(0, 7);
  if (!data) return <p className="muted">Chargement…</p>;
  const { appartements: vendus, objectif } = data;
  const pct = objectif ? Math.min(100, Math.round((vendus / objectif) * 100)) : 0;
  const atteint = objectif != null && vendus >= objectif;
  const restant = objectif != null ? Math.max(0, objectif - vendus) : null;

  return (
    <div className="stack">
      <div className="toolbar">
        <button className="ghost" onClick={() => setMois(decaler(mois, -1))} aria-label="Mois précédent">←</button>
        <h1 className="mois-titre">{nomMois(mois)}</h1>
        <button className="ghost" onClick={() => setMois(decaler(mois, 1))} disabled={courant} aria-label="Mois suivant">→</button>
        {!courant && <button className="ghost sm" onClick={() => setMois(today().slice(0, 7))}>Ce mois-ci</button>}
      </div>

      <section className="card objectif-card">
        <div className="objectif-chiffres">
          <span className="objectif-label">Appartements vendus</span>
          <div className="objectif-score">
            <strong>{vendus}</strong>
            <span>/ {objectif ?? '—'}</span>
          </div>
          <p className={atteint ? 'objectif-ok' : 'muted'}>
            {objectif == null ? 'Aucun objectif défini.'
              : atteint ? (vendus > objectif ? `Objectif dépassé de ${vendus - objectif}.` : 'Objectif atteint.')
              : `Encore ${restant} appartement${restant > 1 ? 's' : ''} pour atteindre l'objectif.`}
          </p>
        </div>
        <div className="objectif-jauge" aria-label={`${pct} % de l'objectif`}>
          <div className={atteint ? 'ok' : ''} style={{ width: `${objectif ? pct : 0}%` }} />
        </div>
        <div className="objectif-edit">
          {edition ? (
            <form className="inline" onSubmit={enregistrer}>
              <label htmlFor="objectif-saisie" className="muted small">Objectif de {nomMois(mois)}</label>
              <input id="objectif-saisie" type="number" min="0" step="1" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoFocus required />
              <button className="primary sm" type="submit">Enregistrer</button>
              <button className="ghost sm" type="button" onClick={() => setEdition(false)}>Annuler</button>
            </form>
          ) : (
            <>
              <span className="muted small">
                {objectif == null ? '' : data.objectif_herite ? 'Objectif repris du mois précédent.' : `Objectif fixé pour ${nomMois(mois)}.`}
              </span>
              <button className="secondary sm" onClick={() => { setSaisie(objectif ?? ''); setEdition(true); }}>
                {objectif == null ? "Définir l'objectif" : "Modifier l'objectif"}
              </button>
            </>
          )}
        </div>
        <ErrorLine error={error} />
      </section>

      <section className="kpis">
        <div className="kpi"><span>Chiffre d'affaires signé</span><strong>{dt(data.montant)}</strong></div>
        <div className="kpi"><span>Celliers vendus</span><strong>{data.celliers}</strong></div>
        <div className="kpi"><span>Parkings vendus</span><strong>{data.parkings}</strong></div>
        <div className="kpi"><span>Nouvelles réservations</span><strong>{data.reservations}</strong></div>
      </section>

      <section className="card">
        <h2>Six derniers mois</h2>
        <Historique historique={data.historique} selection={mois} onSelect={setMois} />
      </section>

      <section className="card">
        <h2>Ventes de {nomMois(mois)}</h2>
        {data.ventes.length === 0 ? <p className="muted">Aucune vente confirmée ce mois-ci.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Client</th><th>Lots</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {data.ventes.map((v) => (
                  <tr key={v.id}>
                    <td>{date(v.date_vente)}</td>
                    <td><button className="link" onClick={() => go('ventes', { venteId: v.id })}>{v.client_nom}</button></td>
                    <td>{v.lots.map((l) => `${l.type === 'appartement' ? `${TYPES[l.type]} ${l.typologie || ''}`.trim() : TYPES[l.type]} ${l.ref}`).join(' · ')}</td>
                    <td className="num">{dt(v.prix_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Une vente compte dans le mois où le dossier passe en « vente ferme ». Les réservations ne sont pas comptées.</p>
      </section>
    </div>
  );
}

function Historique({ historique, selection, onSelect }) {
  // Un peu de marge au-dessus pour que le trait d'objectif ne touche pas le chiffre.
  const max = Math.max(1, ...historique.map((h) => Math.max(h.appartements, h.objectif ?? 0))) * 1.15;
  return (
    <div className="histo" role="list">
      {historique.map((h) => {
        const atteint = h.objectif != null && h.appartements >= h.objectif;
        return (
          <button key={h.mois} role="listitem" className={`histo-col ${h.mois === selection ? 'on' : ''}`} onClick={() => onSelect(h.mois)}
            aria-label={`${nomMois(h.mois)} : ${h.appartements} vendus, objectif ${h.objectif ?? 'non défini'}`}>
            <span className="histo-val">{h.appartements}</span>
            <span className="histo-zone">
              <span className={`histo-barre ${atteint ? 'ok' : ''}`} style={{ height: `${(h.appartements / max) * 100}%` }} />
              {h.objectif != null && <span className="histo-objectif" style={{ bottom: `${(h.objectif / max) * 100}%` }} title={`Objectif : ${h.objectif}`} />}
            </span>
            <span className="histo-mois">{nomMois(h.mois, true)}</span>
          </button>
        );
      })}
      <div className="legend histo-legende">
        <span><i className="seg-ok" />Objectif atteint</span><span><i className="seg-accent" />Sous l'objectif</span><span><i className="seg-trait" />Objectif</span>
      </div>
    </div>
  );
}
