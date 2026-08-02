const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://localhost:5000",
    ],
    credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Kinetix Server is running!');
});

const uri = process.env.MONGO_DB_URI;
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
        await client.connect();

        const db = client.db('kinetix_db');
        const campaignsCollection = db.collection('campaigns');

        app.post('/api/campaigns', async (req, res) => {
            const campaignData = req.body;
            const result = await campaignsCollection.insertOne(campaignData);
            res.send(result);
        });


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`Kinetix Server is running on port ${port}`);
});