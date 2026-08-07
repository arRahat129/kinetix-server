const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
            origin.startsWith('http://localhost') ||
            origin.endsWith('.vercel.app') ||
            (process.env.BETTER_AUTH_URL && origin.includes(process.env.BETTER_AUTH_URL))
        ) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

// ==========================================
// JWT VERIFICATION MIDDLEWARE
// ==========================================

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized || No token provided' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized || Malformed token' });
    }
    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        console.error('JWT ERROR:', error.message);
        return res.status(403).json({ message: 'Forbidden || Invalid or expired token' });
    }
};

// Role-based guards (all also require a valid token)
const verifyAdmin = async (req, res, next) => {
    await verifyToken(req, res, () => {
        if (req.user?.role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden || Admin access required' });
        }
        next();
    });
};

const verifyCreator = async (req, res, next) => {
    await verifyToken(req, res, () => {
        if (!['Creator', 'Admin'].includes(req.user?.role)) {
            return res.status(403).json({ message: 'Forbidden || Creator access required' });
        }
        next();
    });
};

const verifySupporter = async (req, res, next) => {
    await verifyToken(req, res, () => {
        if (!['Supporter', 'Admin'].includes(req.user?.role)) {
            return res.status(403).json({ message: 'Forbidden || Supporter access required' });
        }
        next();
    });
};

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        service: 'Kinetix Server API Engine',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())}s`,
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KINETIX Engine — Server API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    :root {
      --bg: #060b18;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #3b82f6;
      --accent: #8b5cf6;
      --cyan: #06b6d4;
      --emerald: #10b981;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 1rem;
      position: relative;
      overflow-x: hidden;
    }
    .glow-1 {
      position: absolute;
      top: -15%;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 700px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(6, 11, 24, 0) 70%);
      border-radius: 50%;
      pointer-events: none;
    }
    .glow-2 {
      position: absolute;
      bottom: -15%;
      left: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(6, 11, 24, 0) 70%);
      border-radius: 50%;
      pointer-events: none;
    }
    .glow-3 {
      position: absolute;
      bottom: -15%;
      right: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, rgba(6, 11, 24, 0) 70%);
      border-radius: 50%;
      pointer-events: none;
    }
    .container {
      max-width: 920px;
      width: 100%;
      z-index: 10;
    }
    .header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 1.1rem;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34d399;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #34d399;
      box-shadow: 0 0 12px #34d399;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .title {
      font-size: 3.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 0.85rem;
      background: linear-gradient(135deg, #ffffff 30%, #93c5fd 70%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: var(--muted);
      font-size: 1.1rem;
      max-width: 620px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      transition: all 0.3s ease;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }
    .card:hover {
      border-color: rgba(59, 130, 246, 0.35);
      transform: translateY(-3px);
      box-shadow: 0 15px 35px rgba(59, 130, 246, 0.15);
    }
    .card-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
    .card-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card-desc {
      font-size: 0.85rem;
      color: var(--muted);
      margin-top: 0.35rem;
    }
    .endpoints-section {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 1.5rem;
      padding: 1.75rem;
      margin-bottom: 2rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }
    .section-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .endpoint-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .endpoint-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1.15rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 0.875rem;
      transition: background 0.2s ease;
    }
    .endpoint-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .endpoint-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .method-get {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 0.4rem;
    }
    .method-post {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 0.4rem;
    }
    .endpoint-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      font-weight: 500;
      color: #e2e8f0;
    }
    .endpoint-auth {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.05);
      padding: 0.2rem 0.5rem;
      border-radius: 0.35rem;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.85rem 1.75rem;
      border-radius: 0.875rem;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: white;
      font-weight: 700;
      font-size: 0.95rem;
      text-decoration: none;
      box-shadow: 0 10px 25px rgba(37, 99, 235, 0.35);
      transition: all 0.25s ease;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px rgba(37, 99, 235, 0.5);
    }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.85rem 1.75rem;
      border-radius: 0.875rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      font-weight: 600;
      font-size: 0.95rem;
      text-decoration: none;
      transition: all 0.25s ease;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    .footer {
      text-align: center;
      margin-top: 3rem;
      color: #64748b;
      font-size: 0.825rem;
    }
  </style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>
  <div class="glow-3"></div>

  <div class="container">
    <header class="header">
      <div class="badge">
        <span class="dot"></span>
        <span>Kinetix API • Active & Operational</span>
      </div>
      <h1 class="title">KINETIX Server Engine</h1>
      <p class="subtitle">High-performance crowdfunding REST API powering campaigns, secure credit contributions, authentication & user management.</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Server Status</div>
        <div class="card-value" style="color: #34d399;">⚡ Operational</div>
        <div class="card-desc">Express Engine on Node.js</div>
      </div>
      <div class="card">
        <div class="card-title">Database</div>
        <div class="card-value" style="color: #60a5fa;">🍃 MongoDB</div>
        <div class="card-desc">kinetix_db Database</div>
      </div>
      <div class="card">
        <div class="card-title">Security</div>
        <div class="card-value" style="color: #a78bfa;">🔒 Better Auth</div>
        <div class="card-desc">JWKS & RBAC Guards</div>
      </div>
    </div>

    <div class="endpoints-section">
      <div class="section-title">
        <span>Public (Unprotected) REST Endpoints</span>
        <span style="font-size: 0.8rem; font-weight: 500; color: #64748b;">Click to test in browser</span>
      </div>
      <div class="endpoint-list">
        <a href="/health" target="_blank" style="text-decoration: none;" class="endpoint-item">
          <div class="endpoint-left">
            <span class="method-get">GET</span>
            <span class="endpoint-path">/health</span>
          </div>
          <span class="endpoint-auth" style="color: #34d399;">Public System Health</span>
        </a>
        <a href="/api/campaigns/approved" target="_blank" style="text-decoration: none;" class="endpoint-item">
          <div class="endpoint-left">
            <span class="method-get">GET</span>
            <span class="endpoint-path">/api/campaigns/approved</span>
          </div>
          <span class="endpoint-auth" style="color: #34d399;">Public Approved Campaigns</span>
        </a>
        <a href="/api/reviews" target="_blank" style="text-decoration: none;" class="endpoint-item">
          <div class="endpoint-left">
            <span class="method-get">GET</span>
            <span class="endpoint-path">/api/reviews</span>
          </div>
          <span class="endpoint-auth" style="color: #34d399;">Public Reviews</span>
        </a>
        <a href="/api/reviews/featured" target="_blank" style="text-decoration: none;" class="endpoint-item">
          <div class="endpoint-left">
            <span class="method-get">GET</span>
            <span class="endpoint-path">/api/reviews/featured</span>
          </div>
          <span class="endpoint-auth" style="color: #34d399;">Public Featured Reviews</span>
        </a>
      </div>
    </div>

    <div class="actions">
      <a href="/health" class="btn-primary" target="_blank">
        ⚡ Check Health Status (JSON)
      </a>
      <a href="/api/campaigns/approved" class="btn-secondary" target="_blank">
        🚀 View Approved Campaigns
      </a>
      <a href="/api/reviews" class="btn-secondary" target="_blank">
        ⭐ View Public Reviews
      </a>
    </div>

    <footer class="footer">
      <p>© 2026 KINETIX Platform • Vercel Serverless Ready</p>
    </footer>
  </div>
</body>
</html>
    `);
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
        // await client.connect();

        const db = client.db('kinetix_db');
        const campaignsCollection = db.collection('campaigns');
        const contributionsCollection = db.collection('contributions');
        const usersCollection = db.collection('user');
        const paymentsCollection = db.collection('payments');
        const withdrawalsCollection = db.collection('withdrawals');
        const reportsCollection = db.collection('reports');
        const reviewsCollection = db.collection('reviews');

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

        // 1b. Get Top Funded Approved Campaigns (Limit 6, sorted by raised amount descending with precalculated progress)
        app.get('/api/campaigns/top-funded', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 6;

                const topCampaigns = await campaignsCollection.aggregate([
                    { $match: { status: 'approved' } },
                    {
                        $addFields: {
                            raised: {
                                $toDouble: {
                                    $ifNull: ["$raised_amount", { $ifNull: ["$amount_raised", 0] }]
                                }
                            },
                            goal: {
                                $toDouble: {
                                    $ifNull: ["$funding_goal", 1]
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            progress: {
                                $cond: [
                                    { $gt: ["$goal", 0] },
                                    { $round: [{ $multiply: [{ $divide: ["$raised", "$goal"] }, 100] }, 0] },
                                    0
                                ]
                            }
                        }
                    },
                    { $sort: { raised: -1, createdAt: -1 } },
                    { $limit: limit }
                ]).toArray();

                res.send({
                    success: true,
                    data: topCampaigns
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 1c. Get Platform Impact Statistics (Supporter users count, approved campaigns count, total credits raised, success rate %)
        app.get('/api/platform/impact', async (req, res) => {
            try {
                // Count active supporters (users with role 'Supporter', case-insensitive)
                const activeSupporters = await usersCollection.countDocuments({
                    role: { $regex: /^supporter$/i }
                });

                // Aggregate stats for approved campaigns
                const campaignStats = await campaignsCollection.aggregate([
                    { $match: { status: 'approved' } },
                    {
                        $addFields: {
                            raised: {
                                $toDouble: {
                                    $ifNull: ["$raised_amount", { $ifNull: ["$amount_raised", 0] }]
                                }
                            },
                            goal: {
                                $toDouble: {
                                    $ifNull: ["$funding_goal", 0]
                                }
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            campaignsFunded: { $sum: 1 },
                            creditsRaised: { $sum: "$raised" },
                            completedCampaigns: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gt: ["$goal", 0] },
                                                { $gte: ["$raised", "$goal"] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ]).toArray();

                const statsResult = campaignStats[0] || {
                    campaignsFunded: 0,
                    creditsRaised: 0,
                    completedCampaigns: 0
                };

                const campaignsFunded = statsResult.campaignsFunded;
                const creditsRaised = statsResult.creditsRaised;
                const successRate = campaignsFunded > 0
                    ? Math.round((statsResult.completedCampaigns / campaignsFunded) * 100)
                    : 0;

                res.send({
                    success: true,
                    data: {
                        campaignsFunded,
                        creditsRaised,
                        activeSupporters,
                        successRate
                    }
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 2. Get individual user's campaigns by userId (Pagination, Single Status Filter, Search, Deadline Descending Sort default)
        app.get('/api/campaigns/my-campaigns', verifyToken, async (req, res) => {
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
        app.get('/api/campaigns/:id', verifyToken, async (req, res) => {
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
        app.post('/api/campaigns', verifyCreator, async (req, res) => {
            const campaignData = req.body;
            const result = await campaignsCollection.insertOne(campaignData);
            res.send(result);
        });

        // 4. Update Campaign
        app.patch('/api/campaigns/:id', verifyCreator, async (req, res) => {
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
        app.delete('/api/campaigns/:id', verifyToken, async (req, res) => {
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
        app.get('/api/admin/users', verifyAdmin, async (req, res) => {
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
        app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
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
        app.patch('/api/admin/users/:id/role', verifyAdmin, async (req, res) => {
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
        app.get('/api/payments/my-history', verifyToken, async (req, res) => {
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
        app.get('/api/admin/campaigns', verifyAdmin, async (req, res) => {
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
        app.patch('/api/admin/campaigns/:id/status', verifyAdmin, async (req, res) => {
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
        app.post('/api/contributions', verifySupporter, async (req, res) => {
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
        app.get('/api/contributions', verifyToken, async (req, res) => {
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

        // 9c. Approve contribution (Creator accepts contribution: credits added to creator balance, increment campaign stats)
        app.patch('/api/contributions/:id/approve', verifyCreator, async (req, res) => {
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
                const creatorEmail = contribution.creator_email || contribution.creatorEmail;

                await contributionsCollection.updateOne(filter, {
                    $set: { status: 'approved', updatedAt: new Date().toISOString() }
                });

                // Add credits directly to the creator's balance
                if (creatorEmail) {
                    await usersCollection.updateOne(
                        { email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                        { $inc: { credits: amountVal }, $set: { updatedAt: new Date().toISOString() } }
                    );
                }

                // Increment campaign stats
                if (campId) {
                    const isObjId = ObjectId.isValid(campId);
                    const campFilter = isObjId ? { $or: [{ _id: new ObjectId(campId) }, { _id: String(campId) }] } : { _id: campId };
                    await campaignsCollection.updateOne(
                        campFilter,
                        {
                            $inc: { raised_amount: amountVal, amount_raised: amountVal, supporters_count: 1 },
                            $set: { updatedAt: new Date().toISOString() }
                        }
                    );
                }

                res.send({ success: true, message: 'Contribution approved and creator credited successfully' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 9d. Reject contribution (refunds credits to supporter)
        app.patch('/api/contributions/:id/reject', verifyCreator, async (req, res) => {
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

        // 9e. Update contribution (Supporter updates details or amount of pending/approved/rejected)
        app.patch('/api/contributions/:id', verifySupporter, async (req, res) => {
            try {
                const { id } = req.params;
                const { Contribution_amount, amount, message } = req.body;
                const filter = { _id: new ObjectId(id) };

                const contribution = await contributionsCollection.findOne(filter);
                if (!contribution) {
                    return res.status(404).send({ success: false, message: 'Contribution not found' });
                }

                const newAmount = Number(Contribution_amount || amount || 0);
                const oldAmount = Number(contribution.Contribution_amount || contribution.amount || 0);
                const diff = newAmount - oldAmount;
                const suppEmail = contribution.Supporter_email || contribution.userEmail;

                if (contribution.status === 'pending') {
                    if (diff !== 0) {
                        const supporter = await usersCollection.findOne({ email: suppEmail });
                        if (!supporter || (supporter.credits || 0) < diff) {
                            return res.status(400).send({ success: false, message: 'Insufficient credits balance to update contribution.' });
                        }

                        // Deduct/refund difference from supporter
                        await usersCollection.updateOne(
                            { email: suppEmail },
                            { $inc: { credits: -diff }, $set: { updatedAt: new Date().toISOString() } }
                        );
                    }

                    await contributionsCollection.updateOne(filter, {
                        $set: {
                            Contribution_amount: newAmount,
                            amount: newAmount,
                            message: message !== undefined ? message : contribution.message,
                            updatedAt: new Date().toISOString()
                        }
                    });
                } else {
                    // Approved or Rejected contributions can only update their note/message (amount cannot be changed directly)
                    await contributionsCollection.updateOne(filter, {
                        $set: {
                            message: message !== undefined ? message : contribution.message,
                            updatedAt: new Date().toISOString()
                        }
                    });
                }

                res.send({ success: true, message: 'Contribution updated successfully.' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 9f. Delete/Withdraw contribution (Supporter cancels contribution)
        app.delete('/api/contributions/:id', verifySupporter, async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const contribution = await contributionsCollection.findOne(filter);
                if (!contribution) {
                    return res.status(404).send({ success: false, message: 'Contribution not found' });
                }

                const amountVal = Number(contribution.Contribution_amount || contribution.amount || 0);
                const suppEmail = contribution.Supporter_email || contribution.userEmail;
                const campId = contribution.campaign_id || contribution.campaignId;

                // 1. If status is pending: refund supporter credits, remove contribution completely
                if (contribution.status === 'pending') {
                    if (suppEmail && amountVal > 0) {
                        await usersCollection.updateOne(
                            { email: { $regex: `^${suppEmail}$`, $options: 'i' } },
                            { $inc: { credits: amountVal }, $set: { updatedAt: new Date().toISOString() } }
                        );
                    }
                }
                // 2. If status is approved: refund supporter credits, deduct from creator credits (reversing approval), decrement campaign stats
                else if (contribution.status === 'approved') {
                    if (suppEmail && amountVal > 0) {
                        await usersCollection.updateOne(
                            { email: { $regex: `^${suppEmail}$`, $options: 'i' } },
                            { $inc: { credits: amountVal }, $set: { updatedAt: new Date().toISOString() } }
                        );
                    }

                    const creatorEmail = contribution.creator_email || contribution.creatorEmail;
                    if (creatorEmail && amountVal > 0) {
                        await usersCollection.updateOne(
                            { email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                            { $inc: { credits: -amountVal }, $set: { updatedAt: new Date().toISOString() } }
                        );
                    }

                    if (campId) {
                        const isObjId = ObjectId.isValid(campId);
                        const campFilter = isObjId ? { $or: [{ _id: new ObjectId(campId) }, { _id: String(campId) }] } : { _id: campId };
                        await campaignsCollection.updateOne(
                            campFilter,
                            {
                                $inc: { raised_amount: -amountVal, amount_raised: -amountVal, supporters_count: -1 },
                                $set: { updatedAt: new Date().toISOString() }
                            }
                        );
                    }
                }
                // 3. If status is rejected: credits were already refunded when rejected, so we just delete it from DB

                await contributionsCollection.deleteOne(filter);
                res.send({ success: true, message: 'Contribution withdrawn successfully.' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 10a. Supporter stats
        app.get('/api/supporter/stats', verifySupporter, async (req, res) => {
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
        app.get('/api/creator/stats', verifyCreator, async (req, res) => {
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

                // Fetch creator's actual credit balance from user document
                let creatorCredits = 0;
                if (creatorEmail) {
                    const creatorUser = await usersCollection.findOne({ email: creatorEmail });
                    if (creatorUser) {
                        creatorCredits = Number(creatorUser.credits || 0);
                    }
                }

                res.send({
                    success: true,
                    totalCampaigns,
                    activeCampaigns,
                    totalAmountRaised,
                    creatorCredits
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11a. Create withdrawal request (Creator requests withdrawal; credits immediately deducted)
        app.post('/api/withdrawals', verifyCreator, async (req, res) => {
            try {
                const { creator_email, creator_name, withdrawal_credit, payment_system, account_number } = req.body;
                const credits = Number(withdrawal_credit) || 0;
                if (!creator_email || credits < 200 || !account_number) {
                    return res.status(400).send({ success: false, message: 'Invalid withdrawal request. Minimum 200 credits required.' });
                }

                const creator = await usersCollection.findOne({ email: { $regex: `^${creator_email}$`, $options: 'i' } });
                if (!creator) {
                    return res.status(404).send({ success: false, message: 'Creator user not found.' });
                }

                const availableCredits = Number(creator.credits || 0);
                if (availableCredits < credits) {
                    return res.status(400).send({ success: false, message: `Insufficient credits. You have ${availableCredits} credits.` });
                }

                // Deduct credits from creator immediately
                await usersCollection.updateOne(
                    { email: { $regex: `^${creator_email}$`, $options: 'i' } },
                    { $inc: { credits: -credits }, $set: { updatedAt: new Date().toISOString() } }
                );

                const withdrawalDoc = {
                    creator_email,
                    creator_name: creator_name || creator.name || 'Creator',
                    withdrawal_credit: credits,
                    withdrawal_amount: credits / 20, // 20 credits = $1 USD
                    payment_system: payment_system || 'Bank Transfer',
                    account_number,
                    status: 'pending',
                    withdraw_date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const result = await withdrawalsCollection.insertOne(withdrawalDoc);
                res.send({ success: true, insertedId: result.insertedId, data: withdrawalDoc });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11b. Update pending withdrawal request (adjusts creator credits accordingly)
        app.patch('/api/withdrawals/:id', verifyCreator, async (req, res) => {
            try {
                const { id } = req.params;
                const { withdrawal_credit, payment_system, account_number } = req.body;
                const newCredits = Number(withdrawal_credit) || 0;

                if (newCredits < 200 || !account_number) {
                    return res.status(400).send({ success: false, message: 'Minimum 200 credits and account number are required.' });
                }

                const filter = { _id: new ObjectId(id) };
                const existingReq = await withdrawalsCollection.findOne(filter);
                if (!existingReq) {
                    return res.status(404).send({ success: false, message: 'Withdrawal request not found.' });
                }

                if (existingReq.status !== 'pending') {
                    return res.status(400).send({ success: false, message: 'Only pending requests can be modified.' });
                }

                const creatorEmail = existingReq.creator_email;
                const creator = await usersCollection.findOne({ email: { $regex: `^${creatorEmail}$`, $options: 'i' } });
                if (!creator) {
                    return res.status(404).send({ success: false, message: 'Creator user not found.' });
                }

                const oldCredits = Number(existingReq.withdrawal_credit) || 0;
                const diff = newCredits - oldCredits;

                if (diff > 0) {
                    const availableCredits = Number(creator.credits || 0);
                    if (availableCredits < diff) {
                        return res.status(400).send({ success: false, message: `Insufficient credits to increase request. You need ${diff} more credits but only have ${availableCredits} available.` });
                    }
                }

                // Adjust creator credits (positive diff = deduct more, negative diff = refund)
                await usersCollection.updateOne(
                    { email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                    { $inc: { credits: -diff }, $set: { updatedAt: new Date().toISOString() } }
                );

                const updateDoc = {
                    $set: {
                        withdrawal_credit: newCredits,
                        withdrawal_amount: newCredits / 20,
                        payment_system,
                        account_number,
                        updatedAt: new Date().toISOString()
                    }
                };

                await withdrawalsCollection.updateOne(filter, updateDoc);
                res.send({ success: true, message: 'Withdrawal request updated successfully.' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11c. Delete / cancel withdrawal request (refunds creator credits)
        app.delete('/api/withdrawals/:id', verifyCreator, async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const existingReq = await withdrawalsCollection.findOne(filter);
                if (!existingReq) {
                    return res.status(404).send({ success: false, message: 'Withdrawal request not found.' });
                }

                if (existingReq.status === 'pending') {
                    const creatorEmail = existingReq.creator_email;
                    const refundCredits = Number(existingReq.withdrawal_credit) || 0;

                    // Refund credits to creator
                    await usersCollection.updateOne(
                        { email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                        { $inc: { credits: refundCredits }, $set: { updatedAt: new Date().toISOString() } }
                    );
                }

                await withdrawalsCollection.deleteOne(filter);
                res.send({ success: true, message: 'Withdrawal request deleted and credits refunded.' });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11d. Get creator withdrawals
        app.get('/api/withdrawals/creator', verifyCreator, async (req, res) => {
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

        // 11e. Get all withdrawals (for Admin)
        app.get('/api/admin/withdrawals', verifyAdmin, async (req, res) => {
            try {
                const { status = '', search = '', page = 1, limit = 10 } = req.query;
                const query = {};
                if (status) {
                    query.status = status;
                }
                if (search) {
                    query.$or = [
                        { creator_email: { $regex: search, $options: 'i' } },
                        { creator_name: { $regex: search, $options: 'i' } },
                        { payment_system: { $regex: search, $options: 'i' } },
                        { account_number: { $regex: search, $options: 'i' } }
                    ];
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const total = await withdrawalsCollection.countDocuments(query);
                const data = await withdrawalsCollection
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
                    data
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 11f. Admin update withdrawal status (Approve / Reject)
        app.patch('/api/admin/withdrawals/:id/status', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { status, adminNote = '' } = req.body;

                if (!['approved', 'rejected'].includes(status)) {
                    return res.status(400).send({ success: false, message: 'Invalid status' });
                }

                const filter = { _id: new ObjectId(id) };
                const withdrawalReq = await withdrawalsCollection.findOne(filter);
                if (!withdrawalReq) {
                    return res.status(404).send({ success: false, message: 'Withdrawal request not found' });
                }

                if (withdrawalReq.status !== 'pending') {
                    return res.status(400).send({ success: false, message: 'This request has already been processed.' });
                }

                if (status === 'rejected') {
                    const creatorEmail = withdrawalReq.creator_email;
                    const refundCredits = Number(withdrawalReq.withdrawal_credit) || 0;

                    // Refund credits back to creator
                    await usersCollection.updateOne(
                        { email: { $regex: `^${creatorEmail}$`, $options: 'i' } },
                        { $inc: { credits: refundCredits }, $set: { updatedAt: new Date().toISOString() } }
                    );
                }

                await withdrawalsCollection.updateOne(filter, {
                    $set: {
                        status,
                        adminNote,
                        updatedAt: new Date().toISOString()
                    }
                });

                res.send({ success: true, message: `Withdrawal request successfully ${status}.` });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 12. Admin Stats
        app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments();
                const supportersCount = await usersCollection.countDocuments({ role: 'Supporter' });
                const creatorsCount = await usersCollection.countDocuments({ role: 'Creator' });
                const adminsCount = await usersCollection.countDocuments({ role: 'Admin' });

                const totalCampaigns = await campaignsCollection.countDocuments();
                const pendingCampaigns = await campaignsCollection.countDocuments({ status: 'pending' });
                const approvedCampaigns = await campaignsCollection.countDocuments({ status: 'approved' });
                const rejectedCampaigns = await campaignsCollection.countDocuments({ status: 'rejected' });

                const contributions = await contributionsCollection.find({ status: 'approved' }).toArray();
                const totalContributionsCount = await contributionsCollection.countDocuments();
                const totalContributedCredits = contributions.reduce((sum, c) => sum + Number(c.Contribution_amount || c.amount || 0), 0);

                const totalWithdrawalsCount = await withdrawalsCollection.countDocuments();
                const pendingWithdrawalsCount = await withdrawalsCollection.countDocuments({ status: 'pending' });
                const approvedWithdrawals = await withdrawalsCollection.find({ status: 'approved' }).toArray();
                const approvedWithdrawalsCount = approvedWithdrawals.length;
                const totalWithdrawnAmountUSD = approvedWithdrawals.reduce((sum, w) => sum + Number(w.withdrawal_amount || 0), 0);

                const systemRevenue = totalContributedCredits * 0.05; // supporters pay $0.10/credit, creators get $0.05/credit

                // Monthly contributions grouping
                const allApprovedContributions = await contributionsCollection
                    .find({ status: 'approved' })
                    .sort({ createdAt: 1 })
                    .toArray();

                const monthlyFunding = {};
                allApprovedContributions.forEach(c => {
                    const date = c.createdAt ? new Date(c.createdAt) : new Date();
                    const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
                    monthlyFunding[monthKey] = (monthlyFunding[monthKey] || 0) + Number(c.Contribution_amount || c.amount || 0);
                });

                const monthlyData = Object.keys(monthlyFunding).map(month => ({
                    month,
                    amount: monthlyFunding[month]
                })).slice(-6);

                // Category distribution
                const categoryCounts = {};
                const campaigns = await campaignsCollection.find({ status: 'approved' }).toArray();
                campaigns.forEach(c => {
                    const cat = c.category || 'Other';
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
                const categoryData = Object.keys(categoryCounts).map(name => ({
                    name,
                    value: categoryCounts[name]
                }));

                const recentWithdrawals = await withdrawalsCollection
                    .find({ status: 'pending' })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .toArray();

                res.send({
                    success: true,
                    totalUsers,
                    stats: {
                        supportersCount,
                        creatorsCount,
                        adminsCount,
                        totalCampaigns,
                        pendingCampaigns,
                        approvedCampaigns,
                        rejectedCampaigns,
                        totalContributionsCount,
                        totalContributedCredits,
                        totalWithdrawalsCount,
                        pendingWithdrawalsCount,
                        approvedWithdrawalsCount,
                        totalWithdrawnAmountUSD,
                        systemRevenue
                    },
                    monthlyData,
                    categoryData,
                    recentWithdrawals
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // ==========================================
        // 14. REPORTS API ENDPOINTS
        // ==========================================

        // 14a. Create Report
        app.post('/api/reports', verifySupporter, async (req, res) => {
            try {
                const {
                    userId, userName, userEmail, userImage,
                    campaignId, campaignName, campaignImage,
                    creatorId, creatorName, creatorEmail, creatorImage,
                    reason, details
                } = req.body;

                if (!userId || !campaignId || !reason) {
                    return res.status(400).send({ success: false, message: 'Missing required report fields' });
                }

                const reportDoc = {
                    userId: userId || null,
                    userName: userName || 'Anonymous Supporter',
                    userEmail: userEmail || '',
                    userImage: userImage || '',
                    campaignId: campaignId || '',
                    campaignName: campaignName || '',
                    campaignImage: campaignImage || '',
                    creatorId: creatorId || null,
                    creatorName: creatorName || '',
                    creatorEmail: creatorEmail || '',
                    creatorImage: creatorImage || '',
                    reason,
                    details: details || '',
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const result = await reportsCollection.insertOne(reportDoc);
                res.send({ success: true, insertedId: result.insertedId, report: reportDoc });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 14b. Get Admin Reports (Pagination, Search, Status filter)
        app.get('/api/admin/reports', verifyAdmin, async (req, res) => {
            try {
                const { search = '', status = '', page = 1, limit = 10 } = req.query;
                const query = {};

                if (status) {
                    query.status = status;
                }

                if (search) {
                    query.$or = [
                        { campaignName: { $regex: search, $options: 'i' } },
                        { userName: { $regex: search, $options: 'i' } },
                        { userEmail: { $regex: search, $options: 'i' } },
                        { creatorName: { $regex: search, $options: 'i' } },
                        { reason: { $regex: search, $options: 'i' } }
                    ];
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const total = await reportsCollection.countDocuments(query);
                const result = await reportsCollection
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

        // 14c. Get single Report by ID
        app.get('/api/reports/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const report = await reportsCollection.findOne({ _id: new ObjectId(id) });
                if (!report) {
                    return res.status(404).send({ success: false, message: 'Report not found' });
                }
                res.send({ success: true, data: report });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 14d. Update Report status
        app.patch('/api/admin/reports/:id/status', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;

                if (!['pending', 'resolved', 'dismissed'].includes(status)) {
                    return res.status(400).send({ success: false, message: 'Invalid status' });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status,
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await reportsCollection.updateOne(filter, updateDoc);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 14e. Delete Report
        app.delete('/api/admin/reports/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const result = await reportsCollection.deleteOne(filter);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });


        // ==========================================
        // 15. REVIEWS API ENDPOINTS
        // ==========================================

        // 15a. Create Review
        app.post('/api/reviews', verifySupporter, async (req, res) => {
            try {
                const {
                    userId, userName, userEmail, userImage,
                    campaignId, campaignName, campaignImage,
                    creatorId, creatorName, creatorEmail, creatorImage,
                    rating, comment
                } = req.body;

                if (!userId || !campaignId || !rating || !comment) {
                    return res.status(400).send({ success: false, message: 'Missing required review fields' });
                }

                const reviewDoc = {
                    userId: userId || null,
                    userName: userName || 'Anonymous Supporter',
                    userEmail: userEmail || '',
                    userImage: userImage || '',
                    campaignId: campaignId || '',
                    campaignName: campaignName || '',
                    campaignImage: campaignImage || '',
                    creatorId: creatorId || null,
                    creatorName: creatorName || '',
                    creatorEmail: creatorEmail || '',
                    creatorImage: creatorImage || '',
                    rating: Number(rating) || 5,
                    comment: comment || '',
                    isFeatured: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const result = await reviewsCollection.insertOne(reviewDoc);
                res.send({ success: true, insertedId: result.insertedId, review: reviewDoc });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 15b. Get Reviews (supports campaignId, featured, page, limit)
        app.get('/api/reviews', async (req, res) => {
            try {
                const { campaignId, featured, page = 1, limit = 10 } = req.query;
                const query = {};

                if (campaignId) {
                    query.campaignId = campaignId;
                }

                if (featured === 'true') {
                    query.isFeatured = true;
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const total = await reviewsCollection.countDocuments(query);
                const result = await reviewsCollection
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

        // 15c. Get Featured Reviews (for Homepage Testimonials)
        app.get('/api/reviews/featured', async (req, res) => {
            try {
                const result = await reviewsCollection
                    .find({ isFeatured: true })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    data: result
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 15d. Get Admin Reviews (Pagination & Search)
        app.get('/api/admin/reviews', verifyAdmin, async (req, res) => {
            try {
                const { search = '', page = 1, limit = 10 } = req.query;
                const query = {};

                if (search) {
                    query.$or = [
                        { campaignName: { $regex: search, $options: 'i' } },
                        { userName: { $regex: search, $options: 'i' } },
                        { userEmail: { $regex: search, $options: 'i' } },
                        { comment: { $regex: search, $options: 'i' } }
                    ];
                }

                const pageNum = parseInt(page) || 1;
                const limitNum = parseInt(limit) || 10;
                const skip = (pageNum - 1) * limitNum;

                const total = await reviewsCollection.countDocuments(query);
                const result = await reviewsCollection
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

        // 15e. Toggle or update review featured status (Admin)
        app.patch('/api/admin/reviews/:id/featured', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { isFeatured } = req.body;

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        isFeatured: Boolean(isFeatured),
                        updatedAt: new Date().toISOString()
                    }
                };

                const result = await reviewsCollection.updateOne(filter, updateDoc);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // 15f. Delete Review (Admin)
        app.delete('/api/admin/reviews/:id', verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const filter = { _id: new ObjectId(id) };
                const result = await reviewsCollection.deleteOne(filter);
                res.send({ success: true, result });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });


        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);



if (process.env.NODE_ENV !== 'production' || require.main === module) {
    app.listen(port, () => {
        console.log(`Kinetix Server is running on port ${port}`);
    });
}

module.exports = app;