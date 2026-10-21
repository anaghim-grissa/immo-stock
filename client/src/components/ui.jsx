import React, { useEffect, useRef } from 'react';
import { STATUTS_LOT, etatLabel } from '../format.js';

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onClose={onClose} onCancel={onClose}>
      <header className="modal-head">
        <h2>{title}</h2>
        <button className="ghost icon" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export const StatutLot = ({ statut }) => <span className={`pill lot-${statut}`}>{STATUTS_LOT[statut]}</span>;
export const EtatEcheance = ({ e }) => <span className={`pill ech-${e.etat}`}>{etatLabel(e)}</span>;

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ErrorLine({ error }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

export function Progress({ value, max }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress" aria-label={`${Math.round(pct)} % payé`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
