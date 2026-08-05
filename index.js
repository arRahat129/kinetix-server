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
        const paymentsCollection = db.collection('payments');
        const withdrawalsCollection = db.collection('withdrawals');

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

        // 6c. Update user role (Admin, Creator, Supporter) & recalculate default role credits
        app.patch('/api/admin/users/:id/role', async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;

                if (!['Admin', 'Creator', 'Supporter'].includes(role)) {
                    return res.status(400).send({ message: 'Invalid role specified' });
                }

                const filter = { _id: new ObjectId(id) };
                const existingUser = await usersCollection.findOne(filter);
                if (!existingUser) {
                    return res.status(404).send({ message: 'User not found' });
                }

                const oldRole = existingUser.role || 'Supporter';
                const roleDefaultCredits = { Supporter: 50, Creator: 20, Admin: 0 };
                const oldDefault = roleDefaultCredits[oldRole] ?? 0;
                const newDefault = roleDefaultCredits[role] ?? 0;
                const diff = newDefault - oldDefault;

                const currentCredits = Number(existingUser.credits ?? oldDefault);
                const updatedCredits = Math.max(0, currentCredits + diff);

                const updateDoc = {
                    $set: {
                        role,
                        credits: updatedCredits,
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send({ success: true, oldRole, newRole: role, updatedCredits, result });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        // 7. Payment Verification & Credit Addition
        app.post('/api/payments/verify', async (req, res) => {
            try {
                const { stripeSessionId, userEmail, creditsToAdd, amount, userId, userName, userImage } = req.body;

                if (!stripeSessionId || !userEmail) {
                    return res.status(400).send({ success: false, message: 'Missing required parameters' });
                }

                // Check if session already recorded
                const existingPayment = await paymentsCollection.findOne({ stripeSessionId });
                if (existingPayment) {
                    return res.send({
                        success: true,
                        message: 'Payment already processed previously.',
                        data: existingPayment
                    });
                }

                const credits = Number(creditsToAdd) || 0;
                const amountVal = Number(amount) || 0;

                // Update user credits in DB
                const userFilter = { email: userEmail };
                await usersCollection.updateOne(
                    userFilter,
                    { $inc: { credits: credits }, $set: { updatedAt: new Date().toISOString() } }
                );

                // Store transaction history in payments collection
                const paymentRecord = {
                    stripeSessionId,
                    userId: userId || null,
                    userEmail,
                    userName: userName || 'Supporter',
                    userImage: userImage || '',
                    creditsAdded: credits,
                    amount: amountVal,
                    packageName: `${credits} Platform Credits`,
                    paymentMethod: 'Stripe',
                    status: 'completed',
                    createdAt: new Date().toISOString()
                };

                await paymentsCollection.insertOne(paymentRecord);

                res.send({
                    success: true,
                    creditsAdded: credits,
                    userEmail,
                    paymentRecord
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 8. User Payment History
        app.get('/api/payments/my-history', async (req, res) => {
            try {
                const { userEmail } = req.query;
                if (!userEmail) {
                    return res.status(400).send({ message: 'userEmail parameter is required' });
                }
                const history = await paymentsCollection
                    .find({ userEmail })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send({ success: true, data: history });
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

        // 9a. Create contribution (deducts credits immediately)
        app.post('/api/contributions', async (req, res) => {
            try {
                const {
                    campaign_id, campaignId, campaign_title, creator_email, creatorEmail,
                    creator_name, Supporter_name, Supporter_email, userEmail, supporterImage,
                    Contribution_amount, amount, message
                } = req.body;

                const suppEmail = Supporter_email || userEmail;
                const amountVal = Number(Contribution_amount || amount || 0);
                const campId = campaign_id || campaignId;

                if (!suppEmail || !campId || amountVal <= 0) {
                    return res.status(400).send({ success: false, message: 'Invalid contribution data' });
                }

                // Check supporter balance
                const supporter = await usersCollection.findOne({ email: suppEmail });
                if (!supporter || (supporter.credits || 0) < amountVal) {
                    return res.status(400).send({ success: false, message: 'Insufficient credits balance' });
                }

                // Deduct credits from supporter immediately
                await usersCollection.updateOne(
                    { email: suppEmail },
                    { $inc: { credits: -amountVal }, $set: { updatedAt: new Date().toISOString() } }
                );

                const contributionDoc = {
                    campaign_id: campId,
                    campaignId: campId,
                    campaign_title: campaign_title || '',
                    Contribution_amount: amountVal,
                    amount: amountVal,
                    Supporter_email: suppEmail,
                    userEmail: suppEmail,
                    Supporter_name: Supporter_name || supporter.name || 'Supporter',
                    supporterImage: supporterImage || supporter.image || '',
                    creator_name: creator_name || '',
                    creator_email: creator_email || creatorEmail || '',
                    message: message || '',
                    status: 'pending',
                    current_date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const result = await contributionsCollection.insertOne(contributionDoc);
                res.send({ success: true, insertedId: result.insertedId, contribution: contributionDoc });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 9b. Get contributions (supports supporterEmail, creatorEmail, campaignId, status, search, pagination)
        app.get('/api/contributions', async (req, res) => {
            try {
                const { supporterEmail, creatorEmail, campaignId, status, search, page = 1, limit = 10 } = req.query;
                const conditions = [];

                if (supporterEmail) {
                    conditions.push({
                        $or: [
                            { Supporter_email: supporterEmail },
                            { userEmail: supporterEmail },
                            { Supporter_email: { $regex: `^${supporterEmail}$`, $options: 'i' } },
                            { userEmail: { $regex: `^${supporterEmail}$`, $options: 'i' } }
                        ]
                    });
                }

                if (creatorEmail) {
                    conditions.push({
                        $or: [
                            { creator_email: creatorEmail },
                            { creatorEmail: creatorEmail },
                            { creator_email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                            { creatorEmail: { $regex: `^${creatorEmail}$`, $options: 'i' } }
                        ]
                    });
                }

                if (campaignId) {
                    conditions.push({
                        $or: [
                            { campaign_id: campaignId },
                            { campaignId: campaignId }
                        ]
                    });
                }

                if (status) {
                    conditions.push({ status });
                }

                if (search) {
                    conditions.push({
                        $or: [
                            { campaign_title: { $regex: search, $options: 'i' } },
                            { Supporter_name: { $regex: search, $options: 'i' } }
                        ]
                    });
                }

                const query = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : { $and: conditions }) : {};

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const total = await contributionsCollection.countDocuments(query);
                const result = await contributionsCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .toArray();

                res.send({
                    success: true,
                    total,
                    page: pageNum,
                    totalPages: Math.ceil(total / limitNum) || 1,
                    data: result
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 9c. Approve contribution
        app.patch('/api/contributions/:id/approve', async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const contribution = await contributionsCollection.findOne(filter);
                if (!contribution) {
                    return res.status(404).send({ success: false, message: 'Contribution not found' });
                }

                if (contribution.status === 'approved') {
                    return res.send({ success: true, message: 'Already approved' });
                }

                const amountVal = Number(contribution.Contribution_amount || contribution.amount || 0);
                const campId = contribution.campaign_id || contribution.campaignId;

                await contributionsCollection.updateOne(filter, {
                    $set: { status: 'approved', updatedAt: new Date().toISOString() }
                });

                if (campId) {
                    const campFilter = ObjectId.isValid(campId) ? { _id: new ObjectId(campId) } : { _id: campId };
                    await campaignsCollection.updateOne(
                        campFilter,
                        {
                            $inc: { raised_amount: amountVal, amount_raised: amountVal, supporters_count: 1 },
                            $set: { updatedAt: new Date().toISOString() }
                        }
                    );
                }

                res.send({ success: true, message: 'Contribution approved successfully' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 9d. Reject contribution (refunds credits)
        app.patch('/api/contributions/:id/reject', async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const contribution = await contributionsCollection.findOne(filter);
                if (!contribution) {
                    return res.status(404).send({ success: false, message: 'Contribution not found' });
                }

                if (contribution.status === 'rejected') {
                    return res.send({ success: true, message: 'Already rejected' });
                }

                const amountVal = Number(contribution.Contribution_amount || contribution.amount || 0);
                const suppEmail = contribution.Supporter_email || contribution.userEmail;

                await contributionsCollection.updateOne(filter, {
                    $set: { status: 'rejected', updatedAt: new Date().toISOString() }
                });

                if (suppEmail && amountVal > 0) {
                    await usersCollection.updateOne(
                        { email: suppEmail },
                        { $inc: { credits: amountVal }, $set: { updatedAt: new Date().toISOString() } }
                    );
                }

                res.send({ success: true, message: 'Contribution rejected and credits refunded' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 10a. Supporter stats
        app.get('/api/supporter/stats', async (req, res) => {
            try {
                const { supporterEmail } = req.query;
                if (!supporterEmail) {
                    return res.status(400).send({ success: false, message: 'supporterEmail is required' });
                }

                const query = {
                    $or: [
                        { Supporter_email: supporterEmail },
                        { userEmail: supporterEmail },
                        { Supporter_email: { $regex: `^${supporterEmail}$`, $options: 'i' } },
                        { userEmail: { $regex: `^${supporterEmail}$`, $options: 'i' } }
                    ]
                };
                const allContribs = await contributionsCollection.find(query).toArray();

                const totalContributions = allContribs.length;
                const pendingContributions = allContribs.filter(c => c.status === 'pending').length;
                const totalAmountContributed = allContribs
                    .filter(c => c.status === 'approved')
                    .reduce((sum, c) => sum + Number(c.Contribution_amount || c.amount || 0), 0);

                res.send({
                    success: true,
                    totalContributions,
                    pendingContributions,
                    totalAmountContributed
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 10b. Creator stats
        app.get('/api/creator/stats', async (req, res) => {
            try {
                const { creatorEmail, userId } = req.query;
                const conditions = [];
                if (creatorEmail) {
                    conditions.push({
                        $or: [
                            { creatorEmail: creatorEmail },
                            { creatorEmail: { $regex: `^${creatorEmail}$`, $options: 'i' } }
                        ]
                    });
                }
                if (userId) {
                    conditions.push({ userId: userId });
                }

                const query = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : { $or: conditions }) : {};

                const campaigns = await campaignsCollection.find(query).toArray();
                const totalCampaigns = campaigns.length;
                const now = new Date();
                const activeCampaigns = campaigns.filter(c => !c.deadline || new Date(c.deadline) >= now).length;
                const totalAmountRaised = campaigns.reduce((sum, c) => sum + Number(c.raised_amount || c.amount_raised || 0), 0);

                res.send({
                    success: true,
                    totalCampaigns,
                    activeCampaigns,
                    totalAmountRaised
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11a. Create withdrawal
        app.post('/api/withdrawals', async (req, res) => {
            try {
                const { creator_email, creator_name, withdrawal_credit, withdrawal_amount, payment_system, account_number } = req.body;
                const credits = Number(withdrawal_credit) || 0;
                if (!creator_email || credits < 200 || !account_number) {
                    return res.status(400).send({ success: false, message: 'Invalid withdrawal request. Minimum 200 credits required.' });
                }

                const withdrawalDoc = {
                    creator_email,
                    creator_name: creator_name || 'Creator',
                    withdrawal_credit: credits,
                    withdrawal_amount: Number(withdrawal_amount) || (credits / 20),
                    payment_system: payment_system || 'Bank Transfer',
                    account_number,
                    status: 'pending',
                    withdraw_date: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };

                const result = await withdrawalsCollection.insertOne(withdrawalDoc);
                res.send({ success: true, insertedId: result.insertedId, withdrawal: withdrawalDoc });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11b. Get creator withdrawals
        app.get('/api/withdrawals/creator', async (req, res) => {
            try {
                const { creatorEmail } = req.query;
                if (!creatorEmail) {
                    return res.status(400).send({ success: false, message: 'creatorEmail is required' });
                }
                const withdrawals = await withdrawalsCollection.find({ creator_email: creatorEmail }).sort({ createdAt: -1 }).toArray();
                res.send({ success: true, data: withdrawals });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
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