export default function cors(opts = {}) {
  return (req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    if (opts.allowedHeaders) res.setHeader('access-control-allow-headers', opts.allowedHeaders.join(','));
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    next();
  };
}
