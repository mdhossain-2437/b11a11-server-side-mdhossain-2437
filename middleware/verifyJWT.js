const jwt = require('jsonwebtoken')
 
module.exports = function verifyJWT(req, res, next) {
  const token = req.cookies?.token
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    req.user = decoded
    next()
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
 
