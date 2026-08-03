const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        const contributionsCollection = db.collection('contributions');
        const usersCollection = db.collection('users');

        // 1. Get all approved campaigns (Pagination, Multiple Filters, Search, Sort)
        app.get('/api/campaigns/approved', async (req, res) => {
            try {
                const {
                    search = '',
                    category = '',
                    minGoal = '',
                    maxGoal = '',
                    sortBy = 'createdAt',
                    sortOrder = 'desc',
                    page = 1,
                    limit = 10
                } = req.query;

                const query = { status: 'approved' };

                // Search filter (title or story)
                if (search) {
                    query.$or = [
                        { campaign_title: { $regex: search, $options: 'i' } },
                        { campaign_story: { $regex: search, $options: 'i' } }
                    ];
                }

                // Multiple filter options: category, goal range
                if (category) {
                    query.category = category;
                }

                if (minGoal || maxGoal) {
                    query.funding_goal = {};
                    if (minGoal) query.funding_goal.$gte = parseFloat(minGoal);
                    if (maxGoal) query.funding_goal.$lte = parseFloat(maxGoal);
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const sortOptions = {};
                sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

                const total = await campaignsCollection.countDocuments(query);
                const result = await campaignsCollection
                    .find(query)
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .toArray();

                res.send({
                    total,
                    page: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    data: result
                });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 2. Get individual user's campaigns by userId (Pagination, Single Status Filter, Search, Deadline Descending Sort default)
        app.get('/api/campaigns/my-campaigns', async (req, res) => {
            try {
                const {
                    userId,
                    search = '',
                    status = '',
                    sortBy = 'deadline',
                    sortOrder = 'desc',
                    page = 1,
                    limit = 10
                } = req.query;

                if (!userId) {
                    return res.status(400).send({ message: 'userId query parameter is required' });
                }

                const query = { userId };

                // Single filter: status (e.g., approved, pending, rejected)
                if (status) {
                    query.status = status;
                }

                // Search by id or title
                if (search) {
                    if (ObjectId.isValid(search)) {
                        query._id = new ObjectId(search);
                    } else {
                        query.campaign_title = { $regex: search, $options: 'i' };
                    }
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const sortOptions = {};
                sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

                const total = await campaignsCollection.countDocuments(query);
                const result = await campaignsCollection
                    .find(query)
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(limitNum)
                    .toArray();

                res.send({
                    total,
                    page: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    data: result
                });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 3. Create Campaign
        app.post('/api/campaigns', async (req, res) => {
            const campaignData = req.body;
            const result = await campaignsCollection.insertOne(campaignData);
            res.send(result);
        });

        // 4. Update Campaign
        app.patch('/api/campaigns/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;

                const filter = { _id: new ObjectId(id) };
                
                // Remove _id from updateData if present
                delete updateData._id;

                const updateDoc = {
                    $set: {
                        ...updateData,
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await campaignsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 5. Delete Campaign & Refund Approved Supporters
        app.delete('/api/campaigns/:id', async (req, res) => {
            try {
                const { id } = req.params;

                // Find all approved contributions for this campaign
                const contributions = await contributionsCollection.find({
                    campaignId: id,
                    status: 'approved'
                }).toArray();

                // Sum contribution amounts per user email
                const refundsMap = {};
                contributions.forEach(c => {
                    if (c.userEmail && c.amount) {
                        refundsMap[c.userEmail] = (refundsMap[c.userEmail] || 0) + Number(c.amount);
                    }
                });

                // Refund credits back to users in bulk
                const bulkOps = Object.keys(refundsMap).map(email => ({
                    updateOne: {
                        filter: { email },
                        update: { $inc: { credits: refundsMap[email] } }
                    }
                }));

                if (bulkOps.length > 0) {
                    await usersCollection.bulkWrite(bulkOps);
                }

                // Delete related contributions
                await contributionsCollection.deleteMany({ campaignId: id });

                // Delete the campaign from campaigns collection
                const deleteResult = await campaignsCollection.deleteOne({ _id: new ObjectId(id) });

                res.send({
                    success: true,
                    refundedSupportersCount: Object.keys(refundsMap).length,
                    deleteResult
                });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
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