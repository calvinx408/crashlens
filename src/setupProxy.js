// Forwards /api requests from the React dev server (port 3000) to the backend (port 4000).
// Used instead of the "proxy" field in package.json, which breaks the dev server on some networks.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:4000',
      changeOrigin: true,
    })
  );
};
