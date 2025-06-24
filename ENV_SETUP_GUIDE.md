# Environment Setup Guide

## 🔑 **API Key Configuration**

You need to create a `.env` file in your project root with the following configuration:

### **Create `.env` file:**
```bash
# Create the .env file
touch .env
```

### **Add the following to your `.env` file:**
```env
# KIRI Engine API Configuration
VITE_KIRI_API_KEY=your_kiri_api_key_here
VITE_KIRI_BASE_URL=https://api.kiri-engine.com

# Backend Configuration
VITE_BACKEND_URL=http://localhost:3001

# Luma AI API (if you want to use it as an alternative)
VITE_LUMA_API_KEY=your_luma_api_key_here

# Cloudflare Configuration (for future migration)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# Database Configuration (for future migration)
DATABASE_URL=your_database_url_here

# JWT Secret (for authentication)
JWT_SECRET=your_jwt_secret_here
```

## 🎯 **Where to Get Your API Keys**

### **1. KIRI Engine API Key**
- **Website**: https://kiri-engine.com
- **Sign up** for an account
- **Go to** API section or dashboard
- **Generate** your API key
- **Replace** `your_kiri_api_key_here` with your actual key

### **2. Luma AI API Key (Optional)**
- **Website**: https://lumalabs.ai
- **Sign up** for an account
- **Go to** API section
- **Generate** your API key
- **Replace** `your_luma_api_key_here` with your actual key

### **3. Cloudflare Configuration (For Future Migration)**
- **Account ID**: Found in Cloudflare dashboard
- **API Token**: Generate in Cloudflare dashboard > API Tokens
- **Permissions**: Need R2, D1, and Workers permissions

## 🔧 **Current Setup (Development)**

### **For now, you only need:**
```env
# KIRI Engine API Configuration
VITE_KIRI_API_KEY=your_actual_kiri_api_key
VITE_KIRI_BASE_URL=https://api.kiri-engine.com

# Backend Configuration
VITE_BACKEND_URL=http://localhost:3001
```

### **Steps to get KIRI API Key:**

1. **Visit**: https://kiri-engine.com
2. **Sign up** for an account
3. **Navigate** to API section
4. **Generate** API key
5. **Copy** the key
6. **Paste** it in your `.env` file

## 🚀 **Testing Your API Key**

Once you have your KIRI API key:

1. **Add it to `.env` file**
2. **Restart your server**:
   ```bash
   npm run server
   ```
3. **Test the API**:
   ```bash
   curl -X POST http://localhost:3001/test-kiri-api
   ```

## 📱 **Frontend Integration**

The frontend will automatically use your API key from the environment variables:

```javascript
// In your React components
const apiKey = import.meta.env.VITE_KIRI_API_KEY;
const baseUrl = import.meta.env.VITE_KIRI_BASE_URL;
```

## 🔐 **Security Notes**

- **Never commit** your `.env` file to git
- **Keep your API keys** secure
- **Use different keys** for development and production
- **Rotate keys** regularly

## 🎯 **Next Steps**

1. **Get your KIRI API key** from https://kiri-engine.com
2. **Create the `.env` file** with your key
3. **Restart the server** to load the new environment variables
4. **Test the API** to make sure it works
5. **Start using** the real KIRI Engine instead of simulation

## 💡 **Alternative: Keep Using Simulation**

If you don't want to get a KIRI API key yet, the current setup works perfectly with simulation:

- **QR codes generate** correctly
- **Mobile capture** works
- **3D models display** properly
- **Editing tools** function
- **Session management** works

You can continue developing and testing without a real API key, and add it later when you're ready for production! 🚀
