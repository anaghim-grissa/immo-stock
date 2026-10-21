export const dt = (n) =>
  `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} DT`;

export const date = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const TYPES = { appartement: 'Appartement', cellier: 'Cellier', parking: 'Place de parking' };
export const TYPES_PLURIEL = { appartement: 'Appartements', cellier: 'Celliers', parking: 'Places de parking' };
export const STATUTS_LOT = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu', bloque: 'Bloqué' };
export const ETATS_ECHEANCE = { payee: 'Payée', retard: 'En retard', proche: 'Bientôt due', a_venir: 'À venir' };

export const etatLabel = (e) => {
  if (e.etat === 'retard') return `En retard de ${e.jours} j`;
  if (e.etat === 'proche') return e.jours === 0 ? "Due aujourd'hui" : `Due dans ${e.jours} j`;
  return ETATS_ECHEANCE[e.etat];
};
