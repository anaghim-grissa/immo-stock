import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { dt, date, today, TYPES } from '../format.js';
import { Modal, Field, ErrorLine, EtatEcheance, Progress, NoteJourEcheance } from '../components/ui.jsx';
import { ClientForm } from './Clients.jsx';

export default function Ventes({ nav, go }) {
  const [ventes, setVentes] = useState([]);
  const [creer, setCreer] = useState(false);
  const [filtre, setFiltre] = useState('');
  const load = () => api('/ventes').then(setVentes);
  useEffect(() => { load(); }, [nav.venteId]);

  if (nav.venteId) return <VenteDetail id={nav.venteId} retour={() => go('ventes')} />;

  const list = ventes
    .filter((v) => !nav.clientId || v.client_id === nav.clientId)
    .filter((v) => filtre !== 'retard' || v.nb_retard > 0);

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="segmented">
          <button className={filtre === '' ? 'active' : ''} onClick={() => setFiltre('')}>Tous les dossiers</button>
          <button className={filtre === 'retard' ? 'active' : ''} onClick={() => setFiltre('retard')}>
            En retard <span className="count">{ventes.filter((v) => v.nb_retard).length}</span>
          </button>
        </div>
        {nav.clientId && <button className="ghost" onClick={() => go('ventes')}>Afficher tous les clients</button>}
        <span className="spacer" />
        <button className="primary" onClick={() => setCreer(true)}>Nouvelle réservation / vente</button>
      </div>
      <NoteJourEcheance><AlignerEcheances onDone={load} /></NoteJourEcheance>
      <div className="dossiers">
        {list.map((v) => (
          <button key={v.id} className={`dossier ${v.nb_retard ? 'is-late' : ''}`} onClick={() => go('ventes', { venteId: v.id })}>
            <div className="dossier-head">
              <b>{v.client_nom}</b>
              <span className={`pill ${v.statut === 'vente' ? 'lot-vendu' : 'lot-reserve'}`}>{v.statut === 'vente' ? 'Vente' : 'Réservation'}</span>
            </div>
            <div className="mono small">{v.lots.map((l) => l.ref).join(' · ')}</div>
            <Progress value={v.total_paye} max={v.prix_total} />
            <div className="dossier-nums">
              <span>{dt(v.total_paye)} <small className="muted">/ {dt(v.prix_total)}</small></span>
              {v.nb_retard > 0
                ? <span className="pill ech-retard">{dt(v.montant_en_retard)} en retard</span>
                : v.prochaine_echeance && <span className="muted small">Prochaine : {date(v.prochaine_echeance.date_echeance)}</span>}
            </div>
          </button>
        ))}
        {list.length === 0 && <p className="muted card">Aucun dossier.</p>}
      </div>
      {creer && <NouvelleVente onClose={(id) => { setCreer(false); if (id) go('ventes', { venteId: id }); }} />}
    </div>
  );
}

function VenteDetail({ id, retour }) {
  const [v, setV] = useState(null);
  const [encaisser, setEncaisser] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState('');
  const load = () => api(`/ventes/${id}`).then(setV).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);
  if (error) return <ErrorLine error={error} />;
  if (!v) return <p className="muted">Chargement…</p>;

  const changerStatut = async () => { await api(`/ventes/${id}`, { method: 'PUT', body: { statut: v.statut === 'vente' ? 'reservation' : 'vente' } }); load(); };
  const supprimer = async () => { await api(`/ventes/${id}`, { method: 'DELETE' }); retour(); };
  const annulerPaiement = async (pid) => { await api(`/paiements/${pid}`, { method: 'DELETE' }); load(); };

  return (
    <div className="stack">
      <button className="ghost back" onClick={retour}>← Tous les dossiers</button>
      <section className="card dossier-detail">
        <div className="detail-head">
          <div>
            <h2>{v.client_nom}</h2>
            <p className="muted small">{v.client_tel} · {v.client_email} · signé le {date(v.date_signature)}</p>
          </div>
          <span className={`pill ${v.statut === 'vente' ? 'lot-vendu' : 'lot-reserve'}`}>{v.statut === 'vente' ? 'Vente' : 'Réservation'}</span>
        </div>
        <div className="lots-inline">
          {v.lots.map((l) => (
            <div key={l.id} className="lot-chip"><b className="mono">{l.ref}</b><span>{TYPES[l.type]}{l.typologie ? ` ${l.typologie}` : ''}</span><span className="muted">{dt(l.prix)}</span></div>
          ))}
        </div>
        <div className="kpis compact">
          <div className="kpi"><span>Prix total</span><strong>{dt(v.prix_total)}</strong></div>
          <div className="kpi"><span>Payé</span><strong>{dt(v.total_paye)}</strong></div>
          <div className="kpi"><span>Reste</span><strong>{dt(v.reste_a_payer)}</strong></div>
          <div className={`kpi ${v.nb_retard ? 'danger' : ''}`}><span>En retard</span><strong>{dt(v.montant_en_retard)}</strong></div>
        </div>
        <Progress value={v.total_paye} max={v.prix_total} />
      </section>

      <section className="card">
        <h2>Échéancier</h2>
        <NoteJourEcheance />
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Libellé</th><th>Date prévue</th><th className="num">Montant</th><th className="num">Payé</th><th className="num">Reste</th><th>État</th><th /></tr></thead>
            <tbody>
              {v.echeances.map((e) => (
                <tr key={e.id} className={e.etat === 'retard' ? 'row-danger' : ''}>
                  <td className="muted">{e.rang}</td>
                  <td>{e.libelle}</td>
                  <td>{date(e.date_echeance)}</td>
                  <td className="num">{dt(e.montant)}</td>
                  <td className="num">{e.montant_paye ? dt(e.montant_paye) : '—'}</td>
                  <td className="num">{e.reste ? dt(e.reste) : '—'}</td>
                  <td><EtatEcheance e={e} /></td>
                  <td>{e.etat !== 'payee' && <button className="secondary sm" onClick={() => setEncaisser(e)}>Encaisser</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Paiements reçus</h2>
        {v.paiements.length === 0 ? <p className="muted">Aucun paiement enregistré.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Échéance</th><th>Mode</th><th>Référence</th><th className="num">Montant</th><th /></tr></thead>
              <tbody>
                {v.paiements.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.date_paiement)}</td><td>{p.libelle}</td><td>{p.mode || '—'}</td><td className="mono">{p.reference || '—'}</td>
                    <td className="num">{dt(p.montant)}</td>
                    <td><button className="ghost sm" onClick={() => annulerPaiement(p.id)}>Annuler</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="actions">
        <button className="secondary" onClick={changerStatut}>{v.statut === 'vente' ? 'Repasser en réservation' : 'Confirmer la vente'}</button>
        <span className="spacer" />
        {confirmDel
          ? <><span className="muted">Annuler le dossier libère les lots et efface l'échéancier.</span><button className="danger" onClick={supprimer}>Confirmer l'annulation</button><button className="ghost" onClick={() => setConfirmDel(false)}>Garder</button></>
          : <button className="ghost danger-text" onClick={() => setConfirmDel(true)}>Annuler le dossier</button>}
      </div>

      {encaisser && <Encaisser e={encaisser} onClose={(ok) => { setEncaisser(null); if (ok) load(); }} />}
    </div>
  );
}

function Encaisser({ e, onClose }) {
  const [f, setF] = useState({ montant: e.reste, date_paiement: today(), mode: 'Virement', reference: '' });
  const [error, setError] = useState('');
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const save = async (ev) => {
    ev.preventDefault();
    try { await api(`/echeances/${e.id}/paiements`, { method: 'POST', body: { ...f, montant: Number(f.montant) } }); onClose(true); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Encaisser · ${e.libelle}`} onClose={() => onClose(false)}>
      <p className="muted small">Reste dû : {dt(e.reste)} (prévu le {date(e.date_echeance)})</p>
      <form className="form-grid" onSubmit={save}>
        <Field label="Montant reçu (DT)"><input id="pay-montant" type="number" step="0.001" value={f.montant} onChange={set('montant')} required /></Field>
        <Field label="Date du paiement"><input id="pay-date" type="date" value={f.date_paiement} onChange={set('date_paiement')} required /></Field>
        <Field label="Mode">
          <select id="pay-mode" value={f.mode} onChange={set('mode')}>
            {['Virement', 'Chèque', 'Espèces', 'Traite', 'Crédit bancaire'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Référence (n° chèque, virement…)"><input id="pay-ref" value={f.reference} onChange={set('reference')} /></Field>
        <ErrorLine error={error} />
        <div className="actions full"><span className="spacer" /><button className="primary" type="submit">Enregistrer le paiement</button></div>
      </form>
    </Modal>
  );
}

/** Anciens dossiers : propose de placer leurs échéances à venir sur le jour commun. */
function AlignerEcheances({ onDone }) {
  const [nombre, setNombre] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const [error, setError] = useState('');
  const compter = () => api('/echeances/a-aligner').then((r) => setNombre(r.nombre)).catch(() => {});
  useEffect(() => { compter(); }, []);
  if (!nombre) return null;
  const aligner = async () => {
    try {
      await api('/echeances/aligner', { method: 'POST' });
      setOuvert(false);
      compter();
      onDone();
    } catch (e) { setError(e.message); }
  };
  return (
    <>
      <span className="small">{nombre} échéance{nombre > 1 ? 's' : ''} d'anciens dossiers à une autre date.{' '}
        <button className="primary sm" onClick={() => setOuvert(true)}>Les mettre au même jour</button>
      </span>
      {ouvert && (
        <Modal title="Mettre les anciennes échéances au même jour" onClose={() => setOuvert(false)}>
          <p>Chaque échéance à venir et pas encore payée est déplacée au prochain jour d'échéance du mois (jamais plus tôt : un client n'a jamais moins de temps pour payer).</p>
          <p className="muted">Les échéances payées, les acomptes et les échéances déjà en retard ne changent pas.</p>
          <ErrorLine error={error} />
          <div className="actions"><span className="spacer" /><button className="primary" onClick={aligner}>Déplacer {nombre} échéance{nombre > 1 ? 's' : ''}</button></div>
        </Modal>
      )}
    </>
  );
}

function NouvelleVente({ onClose }) {
  const [clients, setClients] = useState([]);
  const [lots, setLots] = useState([]);
  const [nouveauClient, setNouveauClient] = useState(false);
  const [f, setF] = useState({ clientId: '', lotIds: [], statut: 'reservation', prixTotal: '', acomptePct: 30, nbEcheances: 12, periodicite: 'mensuelle', dateSignature: today(), datePremiere: '' });
  const [prixManuel, setPrixManuel] = useState(false);
  const [apercu, setApercu] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/clients').then(setClients);
    api('/lots').then((ls) => setLots(ls.filter((l) => l.statut === 'disponible')));
  }, []);

  const prixLots = useMemo(() => lots.filter((l) => f.lotIds.includes(l.id)).reduce((s, l) => s + l.prix, 0), [lots, f.lotIds]);
  const prixTotal = prixManuel ? Number(f.prixTotal) || 0 : prixLots;

  useEffect(() => {
    if (!prixTotal) return setApercu([]);
    const t = setTimeout(() => api('/ventes/apercu', { method: 'POST', body: { ...f, prixTotal } }).then(setApercu), 200);
    return () => clearTimeout(t);
  }, [prixTotal, f.acomptePct, f.nbEcheances, f.periodicite, f.dateSignature, f.datePremiere]);

  const jourEcheance = apercu.find((l) => l.libelle.startsWith('Échéance'))?.date_echeance.slice(8);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleLot = (id) => setF({ ...f, lotIds: f.lotIds.includes(id) ? f.lotIds.filter((x) => x !== id) : [...f.lotIds, id] });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api('/ventes', { method: 'POST', body: { ...f, prixTotal } });
      onClose(r.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title="Nouvelle réservation / vente" onClose={() => onClose(null)} wide>
      <form className="vente-form" onSubmit={save}>
        <div className="form-grid">
          <Field label="Client">
            <div className="inline">
              <select id="vente-client" value={f.clientId} onChange={set('clientId')} required>
                <option value="">Choisir…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <button type="button" className="ghost sm" onClick={() => setNouveauClient(true)}>+ Nouveau</button>
            </div>
          </Field>
          <Field label="Type de dossier">
            <select id="vente-statut" value={f.statut} onChange={set('statut')}>
              <option value="reservation">Réservation</option>
              <option value="vente">Vente ferme</option>
            </select>
          </Field>
        </div>

        <fieldset className="lot-picker">
          <legend>Lots disponibles ({f.lotIds.length} choisi{f.lotIds.length > 1 ? 's' : ''})</legend>
          {['appartement', 'cellier', 'parking'].map((t) => (
            <div key={t} className="picker-group">
              <span className="picker-title">{TYPES[t]}</span>
              <div className="picker-items">
                {lots.filter((l) => l.type === t).map((l) => (
                  <button type="button" key={l.id} className={`pick ${f.lotIds.includes(l.id) ? 'on' : ''}`} onClick={() => toggleLot(l.id)} aria-pressed={f.lotIds.includes(l.id)}>
                    <b className="mono">{l.ref}</b>{l.typologie && <span>{l.typologie}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <div className="form-grid">
          <Field label="Prix total (DT)" hint={prixManuel ? `Prix catalogue : ${dt(prixLots)}` : 'Somme des prix catalogue'}>
            <div className="inline">
              <input id="vente-prix" type="number" step="0.001" value={prixManuel ? f.prixTotal : prixLots} disabled={!prixManuel} onChange={set('prixTotal')} />
              <button type="button" className="ghost sm" onClick={() => { setPrixManuel(!prixManuel); setF({ ...f, prixTotal: prixLots }); }}>{prixManuel ? 'Prix catalogue' : 'Négocier'}</button>
            </div>
          </Field>
          <Field label="Acompte à la signature (%)"><input id="vente-acompte" type="number" min="0" max="100" value={f.acomptePct} onChange={set('acomptePct')} /></Field>
          <Field label="Nombre d'échéances"><input id="vente-nb" type="number" min="1" max="120" value={f.nbEcheances} onChange={set('nbEcheances')} /></Field>
          <Field label="Périodicité">
            <select id="vente-per" value={f.periodicite} onChange={set('periodicite')}>
              <option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option><option value="semestrielle">Semestrielle</option>
            </select>
          </Field>
          <Field label="Date de signature"><input id="vente-sig" type="date" value={f.dateSignature} onChange={set('dateSignature')} /></Field>
          <Field label="Mois de la 1re échéance" hint="Vide : le mois après la signature"><input id="vente-premiere" type="month" value={f.datePremiere} onChange={set('datePremiere')} /></Field>
        </div>

        {apercu.length > 0 && (
          <div className="apercu">
            <h3>Échéancier proposé</h3>
            {jourEcheance && <p className="muted small">Toutes les échéances tombent le {Number(jourEcheance)} du mois, comme pour les autres clients.</p>}
            <div className="table-wrap">
              <table>
                <tbody>{apercu.map((l) => <tr key={l.rang}><td>{l.libelle}</td><td>{date(l.date_echeance)}</td><td className="num">{dt(l.montant)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        <ErrorLine error={error} />
        <div className="actions"><span className="spacer" /><button className="primary" type="submit">Enregistrer le dossier</button></div>
      </form>
      {nouveauClient && <ClientForm client={{}} onClose={async (c) => {
        setNouveauClient(false);
        if (c) { const cs = await api('/clients'); setClients(cs); setF((x) => ({ ...x, clientId: String(c.id) })); }
      }} />}
    </Modal>
  );
}
