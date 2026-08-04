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
        const usersCollection = db.collection('user');

        // 1. Get all approved campaigns (Pagination, Search, Category Filter, Sort)
        app.get('/api/campaigns/approved', async (req, res) => {
            try {
                const {
                    search = '',
                    category = '',
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

                // Category filter (case insensitive match, works for full name as well as initial letter legacy data)
                if (category) {
                    query.category = { $regex: `^${category}`, $options: 'i' };
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

        // 3. Get single campaign by ID
        app.get('/api/campaigns/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });
                if (!campaign) {
                    return res.status(404).send({ message: 'Campaign not found' });
                }
                res.send(campaign);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 4. Create Campaign
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

        // 6. ADMIN ROUTES

        // 6a. Get all users
        app.get('/api/admin/users', async (req, res) => {
            try {
                const { search = '', role = '' } = req.query;
                const query = {};

                if (search) {
                    query.$or = [
                        { name: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } }
                    ];
                }
                if (role) {
                    query.role = role;
                }

                const users = await usersCollection.find(query).sort({ createdAt: -1 }).toArray();
                res.send({ success: true, data: users });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 6b. Delete user
        app.delete('/api/admin/users/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const result = await usersCollection.deleteOne(filter);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 6c. Update user role (Admin, Creator, Supporter)
        app.patch('/api/admin/users/:id/role', async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;

                if (!['Admin', 'Creator', 'Supporter'].includes(role)) {
                    return res.status(400).send({ message: 'Invalid role specified' });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        role,
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 6d. Get all campaigns for admin (Supports search, status filter e.g. pending)
        app.get('/api/admin/campaigns', async (req, res) => {
            try {
                const { search = '', status = '', page = 1, limit = 50 } = req.query;
                const query = {};

                if (status) {
                    query.status = status;
                }

                if (search) {
                    query.$or = [
                        { campaign_title: { $regex: search, $options: 'i' } },
                        { creatorEmail: { $regex: search, $options: 'i' } },
                        { creatorName: { $regex: search, $options: 'i' } }
                    ];
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 50;
                const skip = (pageNum - 1) * limitNum;

                const total = await campaignsCollection.countDocuments(query);
                const result = await campaignsCollection
                    .find(query)
                    .sort({ createdAt: -1 })
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

        // 6e. Update campaign status (approved / rejected)
        app.patch('/api/admin/campaigns/:id/status', async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;

                if (!['approved', 'rejected', 'pending'].includes(status)) {
                    return res.status(400).send({ message: 'Invalid status' });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status,
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await campaignsCollection.updateOne(filter, updateDoc);
                res.send({ success: true, result });
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