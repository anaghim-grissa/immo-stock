import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { dt, date, TYPES } from '../format.js';
import { EtatEcheance, Progress, NoteJourEcheance } from '../components/ui.jsx';

export default function Portail() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/portail').then(setData); }, []);
  if (!data) return <p className="muted">Chargement…</p>;
  const retard = data.ventes.reduce((s, v) => s + v.montant_en_retard, 0);

  return (
    <div className="stack">
      <h1 className="welcome">Bonjour {data.client.nom}</h1>
      <NoteJourEcheance />
      {retard > 0 && (
        <section className="alert-band" role="alert">
          <strong>Vous avez {dt(retard)} d'échéances en retard.</strong>
          <span> Merci de régulariser ou de contacter le service commercial.</span>
        </section>
      )}
      {data.ventes.length === 0 && <p className="muted card">Aucun dossier pour le moment.</p>}
      {data.ventes.map((v) => (
        <section key={v.id} className="card">
          <div className="detail-head">
            <h2>{v.lots.map((l) => `${TYPES[l.type]} ${l.ref}`).join(' + ')}</h2>
            <span className={`pill ${v.statut === 'vente' ? 'lot-vendu' : 'lot-reserve'}`}>{v.statut === 'vente' ? 'Vente' : 'Réservation'}</span>
          </div>
          <div className="kpis compact">
            <div className="kpi"><span>Prix total</span><strong>{dt(v.prix_total)}</strong></div>
            <div className="kpi"><span>Déjà payé</span><strong>{dt(v.total_paye)}</strong></div>
            <div className="kpi"><span>Reste à payer</span><strong>{dt(v.reste_a_payer)}</strong></div>
            <div className="kpi"><span>Prochaine échéance</span><strong>{v.prochaine_echeance ? date(v.prochaine_echeance.date_echeance) : 'Soldé'}</strong></div>
          </div>
          <Progress value={v.total_paye} max={v.prix_total} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Échéance</th><th>Date</th><th className="num">Montant</th><th className="num">Payé</th><th>État</th></tr></thead>
              <tbody>
                {v.echeances.map((e) => (
                  <tr key={e.id} className={e.etat === 'retard' ? 'row-danger' : ''}>
                    <td>{e.libelle}</td><td>{date(e.date_echeance)}</td><td className="num">{dt(e.montant)}</td>
                    <td className="num">{e.montant_paye ? dt(e.montant_paye) : '—'}</td><td><EtatEcheance e={e} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
