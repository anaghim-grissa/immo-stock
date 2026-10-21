// Mini-routeur compatible avec l'API Express utilisée par server/src/routes.js.
function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Router() {
  const layers = [];
  const router = {
    use: (fn) => layers.push({ fn }),
    handle(req, res, done) {
      let i = 0;
      const next = () => {
        const l = layers[i++];
        if (!l) return done();
        if (!l.method) return l.fn.handle ? l.fn.handle(req, res, next) : l.fn(req, res, next);
        if (l.method !== req.method) return next();
        const params = match(l.path, req.path);
        if (!params) return next();
        req.params = params;
        l.fn(req, res, next);
      };
      next();
    },
  };
  for (const m of ['get', 'post', 'put', 'delete']) router[m] = (path, ...fns) => fns.forEach((fn) => layers.push({ method: m.toUpperCase(), path, fn }));
  return router;
}
export default { Router };
