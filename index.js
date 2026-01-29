require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const verifyJWT = require('./middleware/verifyJWT');

const app = express();
const port = process.env.PORT || 5000;

// Auto-generate secret if missing (Dev Mode enhancement)
if (!process.env.ACCESS_TOKEN_SECRET) {
    console.warn("⚠️ ACCESS_TOKEN_SECRET not found in .env");
    const secret = crypto.randomBytes(64).toString('hex');
    process.env.ACCESS_TOKEN_SECRET = secret;
    console.log(`✨ Generated temporary secret: ${secret}`);
    console.log("👉 Add this to your .env file for persistence!");
}

// Middleware
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Database Connection
const uri = process.env.MONGO_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    try {
      await client.connect();
      await client.db("admin").command({ ping: 1 });
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch (err) {
      console.error("MongoDB connection failed:", err?.message);
    }

    // Collections
    const db = client.db('carRental');
    const carsCollection = db.collection('cars');

    // Routes will go here
    app.get('/cars', async (req, res) => {
        const { search, sort, limit } = req.query;
        let query = {};

        if (search) {
            query = {
                $or: [
                    { model: { $regex: search, $options: 'i' } },
                    { brand: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } }
                ]
            };
        }

        let options = {};
        if (sort === 'price_asc') options.sort = { dailyPrice: 1 };
        if (sort === 'price_desc') options.sort = { dailyPrice: -1 };
        if (sort === 'date_desc') options.sort = { postedDate: -1 };
        if (sort === 'date_asc') options.sort = { postedDate: 1 };

        const cursor = carsCollection.find(query, options);
        if(limit) {
            const result = await cursor.limit(parseInt(limit)).toArray();
            return res.send(result);
        }
        const result = await cursor.toArray();
        res.send(result);
    });

    app.get('/cars/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await carsCollection.findOne(query);
        res.send(result);
    });

    app.post('/cars', verifyJWT, async (req, res) => {
        try {
            const payload = req.body || {};
            const ownerEmail = req.user?.email;
            const doc = {
                model: payload.model,
                brand: payload.brand,
                dailyPrice: Number(payload.dailyPrice),
                available: Boolean(payload.available),
                regNumber: payload.regNumber,
                features: Array.isArray(payload.features) ? payload.features : [],
                description: payload.description,
                image: payload.image,
                location: payload.location,
                fuelType: payload.fuelType,
                transmission: payload.transmission,
                bookingCount: 0,
                postedDate: new Date(),
                ownerEmail
            };
            const result = await carsCollection.insertOne(doc);
            res.status(201).json({ insertedId: result.insertedId });
        } catch (e) {
            res.status(500).json({ message: 'Failed to add car' });
        }
    });

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Routes
const authRoutes = require('./routes/auth.routes');
app.use('/', authRoutes);

app.get('/', (req, res) => {
    res.send('Car Rental System Server is Running');
});

app.listen(port, () => {
    console.log(`
    🚀 Server is running on port: ${port}
    🔗 http://localhost:${port}
    `);
});
