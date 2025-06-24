# Production Backend Setup Guide

## 🎯 **Current vs Production Storage**

### **Current (Development)**
- **Files**: Local `./uploads/` directory
- **Sessions**: Local `./sessions/` JSON files
- **Models**: Static files in `./public/models/`
- **Processing**: Simulated with timeouts

### **Production (Recommended)**
- **Files**: Cloud storage (AWS S3 / Cloudflare R2)
- **Sessions**: PostgreSQL database
- **Models**: CDN-delivered optimized files
- **Processing**: Real Gaussian Splatting pipeline

## 🏗️ **Backend Architecture Options**

### **Option 1: Cloud-Native (Recommended)**

#### **Storage Stack:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Cloud Storage │
│   (React/Vite)  │◄──►│   (Node.js)     │◄──►│   (S3/R2)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Database      │
                       │   (PostgreSQL)  │
                       └─────────────────┘
```

#### **Implementation:**
1. **AWS S3** or **Cloudflare R2** for 3D model storage
2. **PostgreSQL** for session and user data
3. **Redis** for caching and real-time updates
4. **CDN** (Cloudflare) for fast model delivery

### **Option 2: Self-Hosted**

#### **Storage Stack:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   MinIO Storage │
│   (React/Vite)  │◄──►│   (Node.js)     │◄──►│   (S3-compatible)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   Database      │
                       └─────────────────┘
```

## 📊 **Database Schema**

### **Sessions Table:**
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    patient_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'created',
    model_url TEXT,
    model_format VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    metadata JSONB
);
```

### **Models Table:**
```sql
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    file_url TEXT NOT NULL,
    file_size BIGINT,
    format VARCHAR(10) NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);
```

### **Users Table:**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'doctor',
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔧 **Implementation Steps**

### **Step 1: Set Up Cloud Storage**

#### **AWS S3 Setup:**
```bash
# Install AWS SDK
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Environment variables
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-3d-models-bucket
```

#### **Cloudflare R2 Setup:**
```bash
# Install R2 SDK
npm install @aws-sdk/client-s3

# Environment variables
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your-3d-models-bucket
```

### **Step 2: Set Up Database**

#### **PostgreSQL Setup:**
```bash
# Install PostgreSQL client
npm install pg

# Environment variables
DATABASE_URL=postgresql://username:password@localhost:5432/3d_scanner
```

#### **Database Connection:**
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
```

### **Step 3: Update Upload Endpoint**

#### **Current (Local Storage):**
```javascript
// Current implementation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    cb(null, uploadDir);
  }
});
```

#### **Production (Cloud Storage):**
```javascript
// Production implementation
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

async function uploadToS3(file, sessionId) {
  const key = `sessions/${sessionId}/${file.originalname}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });
  
  await s3Client.send(command);
  return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
}
```

### **Step 4: Update Session Management**

#### **Current (JSON Files):**
```javascript
// Current implementation
async function storeSessionResult(sessionId, modelUrl, format) {
  const sessionData = {
    sessionId,
    modelUrl,
    format,
    completedAt: new Date().toISOString(),
    status: 'completed'
  };
  
  const sessionFile = path.join(__dirname, 'sessions', `${sessionId}.json`);
  await promisify(fs.writeFile)(sessionFile, JSON.stringify(sessionData, null, 2));
}
```

#### **Production (Database):**
```javascript
// Production implementation
async function storeSessionResult(sessionId, modelUrl, format) {
  const query = `
    UPDATE sessions 
    SET status = 'completed', 
        model_url = $1, 
        model_format = $2, 
        completed_at = NOW() 
    WHERE session_id = $3
  `;
  
  await pool.query(query, [modelUrl, format, sessionId]);
}
```

## 🚀 **Deployment Options**

### **Option 1: Vercel + Supabase**
- **Frontend**: Vercel (React/Vite)
- **Backend**: Vercel Functions (Node.js)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (S3-compatible)

### **Option 2: AWS Full Stack**
- **Frontend**: S3 + CloudFront
- **Backend**: Lambda + API Gateway
- **Database**: RDS PostgreSQL
- **Storage**: S3 + CloudFront

### **Option 3: Self-Hosted**
- **Frontend**: Nginx
- **Backend**: Docker + Node.js
- **Database**: PostgreSQL
- **Storage**: MinIO

## 🔐 **Security Considerations**

### **File Upload Security:**
```javascript
// Validate file types
const allowedTypes = ['image/jpeg', 'image/png', 'model/gltf-binary'];
if (!allowedTypes.includes(file.mimetype)) {
  throw new Error('Invalid file type');
}

// Validate file size (max 100MB)
const maxSize = 100 * 1024 * 1024;
if (file.size > maxSize) {
  throw new Error('File too large');
}
```

### **Authentication:**
```javascript
// JWT-based authentication
import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};
```

## 📈 **Performance Optimization**

### **CDN Configuration:**
```javascript
// Cloudflare R2 with CDN
const modelUrl = `https://your-cdn.com/models/${sessionId}/${filename}`;
```

### **Database Indexing:**
```sql
-- Index for fast session lookups
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
```

### **Caching Strategy:**
```javascript
// Redis caching for session data
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function getSessionWithCache(sessionId) {
  const cached = await redis.get(`session:${sessionId}`);
  if (cached) return JSON.parse(cached);
  
  const session = await getSessionFromDB(sessionId);
  await redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));
  return session;
}
```

## 💰 **Cost Estimation**

### **AWS S3 (100GB storage, 1000 requests/month):**
- Storage: $2.30/month
- Requests: $0.005/month
- **Total: ~$2.31/month**

### **PostgreSQL (Supabase Pro):**
- Database: $25/month
- Storage: Included
- **Total: $25/month**

### **CDN (Cloudflare):**
- Bandwidth: Free tier (1TB)
- **Total: $0/month**

### **Total Estimated Cost: ~$27/month**

## 🎯 **Next Steps**

1. **Choose your deployment platform**
2. **Set up cloud storage (S3/R2)**
3. **Configure PostgreSQL database**
4. **Update server.js with production code**
5. **Add authentication and security**
6. **Deploy and test**

## 📚 **Resources**

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Vercel Deployment Guide](https://vercel.com/docs)
