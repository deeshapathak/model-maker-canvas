# Cloudflare R2 + D1 Setup Guide

## 🎯 **Perfect for Your Existing Cloudflare Setup**

Since you're already hosting on Cloudflare, this gives you the most integrated and cost-effective solution for your 3D scanning backend.

## 🚀 **Architecture Overview**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Cloudflare    │    │   Cloudflare    │
│   (Pages)       │◄──►│   Functions     │◄──►│   R2 Storage    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Cloudflare    │
                       │   D1 Database   │
                       └─────────────────┘
```

## 📊 **Database Schema (D1)**

### **Create D1 Database:**
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create 3d-scanner-db

# Add to wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "3d-scanner-db"
database_id = "your-database-id"
```

### **Database Schema:**
```sql
-- sessions.sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    model_url TEXT,
    model_format TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    metadata TEXT -- JSON string
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- models.sql
CREATE TABLE models (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    file_url TEXT NOT NULL,
    file_size INTEGER,
    format TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON string
);

-- users.sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'doctor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### **Deploy Schema:**
```bash
# Deploy schema to D1
wrangler d1 execute 3d-scanner-db --file=./schema.sql
```

## 🗄️ **R2 Storage Setup**

### **Create R2 Bucket:**
```bash
# Create R2 bucket
wrangler r2 bucket create 3d-models-bucket

# Add to wrangler.toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "3d-models-bucket"
```

### **R2 Bucket Configuration:**
```toml
# wrangler.toml
name = "3d-scanner-backend"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "3d-scanner-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "3d-models-bucket"

[env.production]
name = "3d-scanner-backend-prod"
```

## 🔧 **Cloudflare Functions Implementation**

### **Upload Endpoint:**
```javascript
// functions/api/upload.js
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const formData = await request.formData();
    const sessionId = formData.get('sessionId');
    const files = formData.getAll('files');
    
    // Upload files to R2
    const uploadedUrls = [];
    for (const file of files) {
      const key = `sessions/${sessionId}/${file.name}`;
      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
      });
      
      const url = `https://${env.BUCKET.name}.r2.cloudflarestorage.com/${key}`;
      uploadedUrls.push(url);
    }
    
    // Store session in D1
    await env.DB.prepare(`
      INSERT INTO sessions (id, session_id, patient_name, status, model_url)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      sessionId,
      formData.get('patientName'),
      'uploaded',
      uploadedUrls[0]
    ).run();
    
    return new Response(JSON.stringify({
      success: true,
      urls: uploadedUrls
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### **Get Session Endpoint:**
```javascript
// functions/api/session/[sessionId].js
export async function onRequestGet(context) {
  const { params, env } = context;
  const { sessionId } = params;
  
  try {
    const session = await env.DB.prepare(`
      SELECT * FROM sessions WHERE session_id = ?
    `).bind(sessionId).first();
    
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(session), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### **List Sessions Endpoint:**
```javascript
// functions/api/sessions.js
export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const sessions = await env.DB.prepare(`
      SELECT * FROM sessions 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    
    return new Response(JSON.stringify(sessions.results), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

## 🔐 **Authentication with Cloudflare Access**

### **Setup Access:**
```bash
# Install Cloudflare Access
# Go to Cloudflare Dashboard > Access > Applications
# Create new application for your domain
```

### **Protect Functions:**
```javascript
// functions/api/protected/[sessionId].js
export async function onRequest(context) {
  const { request, env } = context;
  
  // Cloudflare Access automatically handles authentication
  // You can access user info from headers
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  
  if (!userEmail) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Your protected logic here
  // ...
}
```

## 📱 **Frontend Integration**

### **Update API Calls:**
```javascript
// src/services/api.js
const API_BASE = 'https://your-domain.com/api';

export const uploadSession = async (sessionId, files, patientName) => {
  const formData = new FormData();
  formData.append('sessionId', sessionId);
  formData.append('patientName', patientName);
  
  files.forEach(file => {
    formData.append('files', file);
  });
  
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  
  return response.json();
};

export const getSession = async (sessionId) => {
  const response = await fetch(`${API_BASE}/session/${sessionId}`);
  return response.json();
};

export const listSessions = async () => {
  const response = await fetch(`${API_BASE}/sessions`);
  return response.json();
};
```

## 🚀 **Deployment**

### **Deploy Functions:**
```bash
# Deploy to Cloudflare Workers
wrangler deploy

# Or deploy specific function
wrangler deploy --name upload-function
```

### **Environment Variables:**
```bash
# Set production variables
wrangler secret put KIRI_API_KEY
wrangler secret put JWT_SECRET
```

## 💰 **Cost Breakdown**

### **Cloudflare R2:**
- **Storage**: $0.015/GB/month
- **Requests**: $4.50/million
- **Bandwidth**: FREE

### **Cloudflare D1:**
- **Free tier**: 100K reads/day, 1K writes/day
- **Pro plan**: $5/month for 1M reads/day, 100K writes/day

### **Cloudflare Functions:**
- **Free tier**: 100,000 requests/day
- **Pro plan**: $5/month for 1M requests/day

### **Estimated Monthly Cost:**
- **100GB storage**: $1.50
- **1M requests**: $4.50
- **D1 Pro**: $5.00
- **Functions Pro**: $5.00
- **Total**: ~$16/month

## 🎯 **Next Steps**

1. **Install Wrangler CLI**
2. **Create D1 database**
3. **Create R2 bucket**
4. **Deploy schema**
5. **Create Cloudflare Functions**
6. **Update frontend API calls**
7. **Deploy and test**

## 🔗 **Useful Commands**

```bash
# Development
wrangler dev

# Deploy
wrangler deploy

# View logs
wrangler tail

# Test D1
wrangler d1 execute 3d-scanner-db --command "SELECT * FROM sessions"

# Test R2
wrangler r2 object list 3d-models-bucket
```

This setup gives you a fully integrated Cloudflare solution with excellent performance and cost-effectiveness! 🚀
