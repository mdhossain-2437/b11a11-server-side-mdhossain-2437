const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router()
 
router.post('/jwt', async (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ message: 'Email required' })
  const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' })
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
  return res.json({ success: true })
})
 
router.post('/logout', async (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  })
  return res.json({ success: true })
})
 
module.exports = router
 
