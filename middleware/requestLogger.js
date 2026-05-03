// Lightweight request logger — keeps logs readable without adding a dependency.
module.exports = function requestLogger(req, _res, next) {
  const ts = new Date().toISOString()
  console.log(`${ts}  ${req.method.padEnd(6)} ${req.originalUrl}`)
  next()
}
