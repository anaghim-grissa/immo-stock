import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { dt, TYPES, TYPES_PLURIEL, STATUTS_LOT } from '../format.js';
import { Modal, Field, ErrorLine, StatutLot } from '../components/ui.jsx';

export default function Stock({ go, nav }) {
  const [lots, setLots] = useState([]);
  const [type, setType] = useState(nav.type || 'appartement');
  const [statut, setStatut] = useState('');
  const [edit, setEdit] = useState(null);

  const load = () => api('/lots').then(setLots);
  useEffect(() => { load(); }, []);

  const filtres = useMemo(() => lots.filter((l) => l.type === type && (!statut || l.statut === statut)), [lots, type, statut]);
  const groupes = useMemo(() => {
    const g = {};
    for (const l of filtres) {
      const k = type === 'appartement' ? `Bloc ${l.bloc || '—'} · ${l.niveau || ''}` : l.niveau || 'Sans niveau';
      (g[k] ??= []).push(l);
    }
    return Object.entries(g);
  }, [filtres, type]);

  const compte = (t) => lots.filter((l) => l.type === t);

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {Object.entries(TYPES_PLURIEL).map(([k, label]) => (
            <button key={k} className={k === type ? 'active' : ''} onClick={() => setType(k)}>
              {label} <span className="count">{compte(k).filter((l) => l.statut === 'disponible').length}/{compte(k).length}</span>
            </button>
          ))}
        </div>
        <select id="filtre-statut" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_LOT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="primary" onClick={() => setEdit({ type })}>Ajouter un lot</button>
      </div>

      {groupes.length === 0 && <p className="muted card">Aucun lot pour ce filtre.</p>}
      {groupes.map(([titre, items]) => (
        <section key={titre} className="card">
          <h3>{titre}</h3>
          <div className="lot-grid">
            {items.map((l) => (
              <button key={l.id} className={`lot-tile lot-${l.statut}`} onClick={() => setEdit(l)}>
                <span className="lot-ref">{l.ref}</span>
                <span className="lot-meta">{[l.typologie, l.surface && `${l.surface} m²`].filter(Boolean).join(' · ')}</span>
                <span className="lot-prix">{dt(l.prix)}</span>
                <span className="lot-foot">{l.client_nom ? l.client_nom : STATUTS_LOT[l.statut]}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {edit && <LotForm lot={edit} go={go} onClose={(changed) => { setEdit(null); if (changed) load(); }} />}
    </div>
  );
}

function LotForm({ lot, onClose, go }) {
  const [f, setF] = useState({ ref: '', type: 'appartement', bloc: '', niveau: '', typologie: '', surface: '', prix: '', bloque: false, notes: '', ...lot, bloque: !!lot.bloque });
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const vendu = lot.vente_id;

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...f, surface: f.surface === '' ? null : Number(f.surface), prix: Number(f.prix) || 0 };
      if (lot.id) await api(`/lots/${lot.id}`, { method: 'PUT', body });
      else await api('/lots', { method: 'POST', body });
      onClose(true);
    } catch (err) { setError(err.message); }
  };
  const del = async () => {
    try { await api(`/lots/${lot.id}`, { method: 'DELETE' }); onClose(true); } catch (err) { setError(err.message); }
  };

  return (
    <Modal title={lot.id ? `Lot ${lot.ref}` : 'Nouveau lot'} onClose={() => onClose(false)}>
      {vendu && (
        <p className="info">
          <StatutLot statut={lot.statut} /> pour <b>{lot.client_nom}</b>.{' '}
          <button type="button" className="link" onClick={() => go('ventes', { venteId: lot.vente_id })}>Voir le dossier et l'échéancier</button>
        </p>
      )}
      <form className="form-grid" onSubmit={save}>
        <Field label="Référence"><input id="lot-ref" value={f.ref} onChange={set('ref')} required placeholder="A-101" /></Field>
        <Field label="Type">
          <select id="lot-type" value={f.type} onChange={set('type')}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {f.type === 'appartement' && <Field label="Bloc"><input id="lot-bloc" value={f.bloc || ''} onChange={set('bloc')} /></Field>}
        <Field label="Niveau"><input id="lot-niveau" value={f.niveau || ''} onChange={set('niveau')} placeholder="RDC, 1er étage, Sous-sol -1" /></Field>
        {f.type === 'appartement' && <Field label="Typologie"><input id="lot-typo" value={f.typologie || ''} onChange={set('typologie')} placeholder="S+2" /></Field>}
        <Field label="Surface (m²)"><input id="lot-surface" type="number" step="0.01" value={f.surface ?? ''} onChange={set('surface')} /></Field>
        <Field label="Prix (DT)"><input id="lot-prix" type="number" step="0.001" value={f.prix} onChange={set('prix')} required /></Field>
        <label className="check"><input id="lot-bloque" type="checkbox" checked={f.bloque} onChange={set('bloque')} disabled={!!vendu} /> Bloquer à la vente</label>
        <Field label="Notes"><input id="lot-notes" value={f.notes || ''} onChange={set('notes')} /></Field>
        <ErrorLine error={error} />
        <div className="actions full">
          {lot.id && !vendu && (confirmDel
            ? <><span className="muted">Supprimer ce lot ?</span><button type="button" className="danger" onClick={del}>Oui, supprimer</button><button type="button" className="ghost" onClick={() => setConfirmDel(false)}>Annuler</button></>
            : <button type="button" className="ghost danger-text" onClick={() => setConfirmDel(true)}>Supprimer</button>)}
          <span className="spacer" />
          <button className="primary" type="submit">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}
