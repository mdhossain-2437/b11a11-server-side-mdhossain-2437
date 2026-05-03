require('dotenv').config()
const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

const verifyJWT = require('./middleware/verifyJWT')
const requestLogger = require('./middleware/requestLogger')
const authRoutes = require('./routes/auth.routes')
const sampleCars = require('./data/sample-cars')

const app = express()
const port = process.env.PORT || 5000

// Auto-generate token secret in dev mode if not provided
if (!process.env.ACCESS_TOKEN_SECRET) {
  console.warn('⚠️  ACCESS_TOKEN_SECRET not set, generating an in-memory secret (dev only)')
  process.env.ACCESS_TOKEN_SECRET = crypto.randomBytes(64).toString('hex')
}

// CORS — accept comma-separated origins via CORS_ORIGINS, with dev fallback.
const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin (no Origin header) requests like curl/health checks
      if (!origin) return cb(null, true)
      if (allowed.includes(origin)) return cb(null, true)
      // Allow any *.vercel.app preview domain when CORS_ORIGINS is set without listing every preview
      if (/^https?:\/\/.+\.vercel\.app$/.test(origin) && allowed.includes('*.vercel.app')) {
        return cb(null, true)
      }
      return cb(new Error(`CORS: origin ${origin} is not allowed`))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(requestLogger)

// Mount auth (JWT cookie + logout) routes early
app.use('/', authRoutes)

// Default + health endpoints
app.get('/', (_req, res) => {
  res.send('VelocityDrive · Car Rental API is running')
})
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  })
})

const uri = process.env.MONGO_URI || ''
if (!uri) {
  console.warn('⚠️  MONGO_URI not set — database routes will fail until configured')
}

const client = new MongoClient(uri || 'mongodb://localhost:27017', {
  serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
})

async function run() {
  try {
    if (uri) {
      await client.connect()
      await client.db('admin').command({ ping: 1 })
      console.log('✅ Connected to MongoDB Atlas')
    }

    const db = client.db('carRental')
    const carsCollection = db.collection('cars')
    const bookingsCollection = db.collection('bookings')

    const sortMap = {
      price_asc: { dailyPrice: 1 },
      price_desc: { dailyPrice: -1 },
      date_desc: { postedDate: -1 },
      date_asc: { postedDate: 1 },
    }

    // ---------- CARS ----------
    app.get('/cars', async (req, res) => {
      try {
        const { search, sort, limit } = req.query
        const query = {}
        if (search && String(search).trim()) {
          const rx = { $regex: String(search).trim(), $options: 'i' }
          query.$or = [{ model: rx }, { brand: rx }, { location: rx }]
        }
        const options = sortMap[sort] ? { sort: sortMap[sort] } : {}
        let cursor = carsCollection.find(query, options)
        if (limit) cursor = cursor.limit(Math.min(Number(limit) || 50, 100))
        const result = await cursor.toArray()
        res.send(result)
      } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Failed to fetch cars' })
      }
    })

    app.get('/cars/:id', async (req, res) => {
      try {
        const id = req.params.id
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
        const result = await carsCollection.findOne({ _id: new ObjectId(id) })
        if (!result) return res.status(404).json({ message: 'Car not found' })
        res.send(result)
      } catch {
        res.status(500).json({ message: 'Failed to fetch car' })
      }
    })

    app.post('/cars', verifyJWT, async (req, res) => {
      try {
        const payload = req.body || {}
        const ownerEmail = req.user?.email
        const required = ['model', 'brand', 'dailyPrice', 'image', 'location']
        for (const f of required) {
          if (!payload[f]) return res.status(400).json({ message: `${f} is required` })
        }
        const doc = {
          model: String(payload.model),
          brand: String(payload.brand),
          dailyPrice: Number(payload.dailyPrice),
          available: payload.available === undefined ? true : Boolean(payload.available),
          regNumber: payload.regNumber || '',
          features: Array.isArray(payload.features) ? payload.features : [],
          description: payload.description || '',
          image: payload.image,
          location: payload.location,
          fuelType: payload.fuelType || '',
          transmission: payload.transmission || '',
          bookingCount: 0,
          postedDate: new Date(),
          ownerEmail,
        }
        const result = await carsCollection.insertOne(doc)
        res.status(201).json({ insertedId: result.insertedId })
      } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Failed to add car' })
      }
    })

    app.get('/my-cars', verifyJWT, async (req, res) => {
      try {
        const options = sortMap[req.query.sort] ? { sort: sortMap[req.query.sort] } : { sort: { postedDate: -1 } }
        const result = await carsCollection.find({ ownerEmail: req.user?.email }, options).toArray()
        res.send(result)
      } catch {
        res.status(500).json({ message: 'Failed to fetch your cars' })
      }
    })

    app.patch('/cars/:id', verifyJWT, async (req, res) => {
      try {
        const id = req.params.id
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
        const body = req.body || {}
        const $set = {}
        const editable = ['model', 'brand', 'dailyPrice', 'regNumber', 'image', 'location', 'description', 'fuelType', 'transmission']
        for (const k of editable) if (body[k] !== undefined) $set[k] = body[k]
        if (body.dailyPrice !== undefined) $set.dailyPrice = Number(body.dailyPrice)
        if (body.available !== undefined) $set.available = Boolean(body.available)
        if (body.features !== undefined) $set.features = Array.isArray(body.features) ? body.features : []
        const query = { _id: new ObjectId(id), ownerEmail: req.user?.email }
        const result = await carsCollection.updateOne(query, { $set })
        res.json({ modifiedCount: result.modifiedCount })
      } catch {
        res.status(500).json({ message: 'Failed to update car' })
      }
    })

    app.delete('/cars/:id', verifyJWT, async (req, res) => {
      try {
        const id = req.params.id
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
        const query = { _id: new ObjectId(id), ownerEmail: req.user?.email }
        const result = await carsCollection.deleteOne(query)
        res.json({ deletedCount: result.deletedCount })
      } catch {
        res.status(500).json({ message: 'Failed to delete car' })
      }
    })

    // ---------- SEED ----------
    // POST /seed?key=<SEED_KEY>  — clears the cars collection and inserts the demo set.
    app.post('/seed', async (req, res) => {
      try {
        const key = req.query.key || req.headers['x-seed-key']
        if (!process.env.SEED_KEY) return res.status(403).json({ message: 'Seeding disabled' })
        if (key !== process.env.SEED_KEY) return res.status(401).json({ message: 'Invalid seed key' })
        const owner = req.headers['x-seed-owner'] || 'demo@velocitydrive.app'
        await carsCollection.deleteMany({ ownerEmail: owner })
        const docs = sampleCars.map((c) => ({
          ...c,
          bookingCount: 0,
          postedDate: new Date(),
          ownerEmail: owner,
        }))
        const result = await carsCollection.insertMany(docs)
        res.json({ insertedCount: result.insertedCount })
      } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Failed to seed cars' })
      }
    })

    // ---------- BOOKINGS ----------
    app.post('/bookings', verifyJWT, async (req, res) => {
      try {
        const { carId, startDate: s, endDate: e } = req.body || {}
        if (!carId || !ObjectId.isValid(carId)) return res.status(400).json({ message: 'Invalid car id' })
        const startDate = new Date(s)
        const endDate = new Date(e)
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
          return res.status(400).json({ message: 'Invalid booking dates' })
        }
        const car = await carsCollection.findOne({ _id: new ObjectId(carId) })
        if (!car) return res.status(404).json({ message: 'Car not found' })
        if (!car.available) return res.status(400).json({ message: 'Car is not available' })

        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        const totalPrice = days * Number(car.dailyPrice)

        const doc = {
          carId: new ObjectId(carId),
          car: {
            _id: car._id,
            model: car.model,
            brand: car.brand,
            image: car.image,
            dailyPrice: car.dailyPrice,
            location: car.location,
          },
          dailyPrice: car.dailyPrice,
          startDate,
          endDate,
          days,
          totalPrice,
          status: 'confirmed',
          userEmail: req.user?.email,
          bookingDate: new Date(),
          createdAt: new Date(),
        }
        const result = await bookingsCollection.insertOne(doc)
        await carsCollection.updateOne({ _id: new ObjectId(carId) }, { $inc: { bookingCount: 1 } })
        res.status(201).json({ insertedId: result.insertedId })
      } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Failed to create booking' })
      }
    })

    app.get('/my-bookings', verifyJWT, async (req, res) => {
      try {
        const sortQ = req.query.sort
        const sortMapBookings = {
          date_desc: { createdAt: -1 },
          date_asc: { createdAt: 1 },
          price_desc: { totalPrice: -1 },
          price_asc: { totalPrice: 1 },
        }
        const options = sortMapBookings[sortQ] ? { sort: sortMapBookings[sortQ] } : { sort: { createdAt: -1 } }
        const result = await bookingsCollection.find({ userEmail: req.user?.email }, options).toArray()
        res.send(result)
      } catch {
        res.status(500).json({ message: 'Failed to fetch bookings' })
      }
    })

    app.patch('/bookings/:id', verifyJWT, async (req, res) => {
      try {
        const id = req.params.id
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
        const body = req.body || {}
        const query = { _id: new ObjectId(id), userEmail: req.user?.email }
        const update = { $set: {} }
        if (body.status) update.$set.status = body.status
        if (body.startDate && body.endDate) {
          const startDate = new Date(body.startDate)
          const endDate = new Date(body.endDate)
          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
            return res.status(400).json({ message: 'Invalid dates' })
          }
          const booking = await bookingsCollection.findOne(query)
          if (!booking) return res.status(404).json({ message: 'Booking not found' })
          const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
          const totalPrice = days * Number(booking.dailyPrice)
          Object.assign(update.$set, { startDate, endDate, days, totalPrice })
        }
        if (Object.keys(update.$set).length === 0) {
          return res.status(400).json({ message: 'No changes provided' })
        }
        const result = await bookingsCollection.updateOne(query, update)
        res.json({ modifiedCount: result.modifiedCount })
      } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Failed to update booking' })
      }
    })

    // ---------- 404 ----------
    app.use((req, res) => {
      res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` })
    })

    // ---------- Error handler ----------
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
      console.error('Unhandled error:', err)
      res.status(err.status || 500).json({ message: err.message || 'Internal server error' })
    })

    app.listen(port, () => {
      console.log(`🚗 VelocityDrive API listening at http://localhost:${port}`)
    })
  } catch (err) {
    console.error('Server bootstrap failed', err)
    process.exit(1)
  }
}

run()
