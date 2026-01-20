# Production Deployment Guide

This document outlines the steps and considerations for deploying Aquarium to production.

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [External Services Setup](#external-services-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Deployment Options](#deployment-options)
6. [Post-Deployment](#post-deployment)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Security Considerations](#security-considerations)
9. [Scaling Considerations](#scaling-considerations)
10. [Known Limitations](#known-limitations)

---

## Pre-Deployment Checklist

### Critical (Must Complete)
- [ ] Create Discord Application and Bot in [Discord Developer Portal](https://discord.com/developers/applications)
- [ ] Set up PostgreSQL database (Neon, Supabase, Railway, or self-hosted)
- [ ] Create [DeepL API](https://www.deepl.com/pro-api) account and obtain API key
- [ ] Set up [Stripe](https://stripe.com) account with products/prices (if using subscriptions)
- [ ] Configure all environment variables
- [ ] Generate strong `SESSION_SECRET` (minimum 32 characters)
- [ ] Set `NODE_ENV=production`
- [ ] Run database migrations (`npx prisma db push`)
- [ ] Deploy slash commands (`npx ts-node src/deploy.ts`)
- [ ] Test bot connection and basic commands

### Recommended
- [ ] Set up error logging service (Sentry, LogRocket, etc.)
- [ ] Configure process manager (PM2, systemd)
- [ ] Set up SSL/TLS certificates (required for OAuth)
- [ ] Configure reverse proxy (nginx, Caddy)
- [ ] Set up health check monitoring
- [ ] Configure database backups
- [ ] Set up CI/CD pipeline
- [ ] Create staging environment

---

## External Services Setup

### 1. Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to **Bot** section:
   - Click "Add Bot"
   - Copy the **Token** → `TOKEN`
   - Enable these Privileged Gateway Intents:
     - `MESSAGE CONTENT INTENT` (required for reading messages)
     - `SERVER MEMBERS INTENT` (optional, for member info)
4. Go to **OAuth2** section:
   - Copy **Client ID** → `CLIENTID`
   - Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
   - Add Redirect URL: `https://your-domain.com/auth/discord/callback`
5. Go to **Installation**:
   - Authorization Methods: Guild Install
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions:
     - Manage Webhooks
     - Send Messages
     - Embed Links
     - Read Message History
     - Use External Emojis
     - View Channels
     - Manage Channels (for `/immersion setup`)

### 2. PostgreSQL Database

**Option A: Neon (Recommended for serverless)**
1. Create account at [neon.tech](https://neon.tech)
2. Create new project
3. Copy connection string → `DATABASE_URL`
4. Enable connection pooling for production

**Option B: Supabase**
1. Create project at [supabase.com](https://supabase.com)
2. Go to Settings → Database
3. Copy connection string (use pooler for serverless)

**Option C: Railway**
1. Create project at [railway.app](https://railway.app)
2. Add PostgreSQL service
3. Copy `DATABASE_URL` from Variables tab

### 3. DeepL API

1. Create account at [deepl.com/pro-api](https://www.deepl.com/pro-api)
2. Choose plan:
   - **Free**: 500,000 characters/month
   - **Pro**: Pay per usage ($5.49 per 1M characters after 500K)
3. Copy API key → `DEEPL_API_KEY`

### 4. Stripe (For Subscriptions)

1. Create account at [stripe.com](https://stripe.com)
2. Create Products and Prices:

   **Guild Plans:**
   | Product | Price | Price ID |
   |---------|-------|----------|
   | Guild Pro | $9.99/month | → `STRIPE_PRO_PRICE_ID` |
   | Guild Premium | $24.99/month | → `STRIPE_PREMIUM_PRICE_ID` |

   **User Plans:**
   | Product | Price | Price ID |
   |---------|-------|----------|
   | User Pro | $9.99/month | → `STRIPE_USER_PRO_PRICE_ID` |
   | User Premium | $24.99/month | → `STRIPE_USER_PREMIUM_PRICE_ID` |

3. Get API keys:
   - Dashboard → Developers → API keys
   - Copy Secret key → `STRIPE_SECRET_KEY`

4. Set up Webhook:
   - Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-domain.com/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy Signing secret → `STRIPE_WEBHOOK_SECRET`

---

## Environment Configuration

Create `.env` file with all production values:

```bash
# Discord Bot (Required)
TOKEN=your_discord_bot_token
CLIENTID=your_discord_client_id
GUILDID=your_primary_guild_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Database (Required)
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Translation (Required)
DEEPL_API_KEY=your_deepl_api_key

# Web Server (Required)
SESSION_SECRET=generate_a_strong_random_string_minimum_32_chars
BASE_URL=https://api.yourdomain.com
DASHBOARD_URL=https://yourdomain.com
NODE_ENV=production
PORT=4001

# Stripe (Required for subscriptions)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_USER_PRO_PRICE_ID=price_...
STRIPE_USER_PREMIUM_PRICE_ID=price_...
```

### Generate Strong Session Secret

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Database Setup

### 1. Apply Schema

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 2. Verify Tables Created

```bash
npx prisma studio
```

Should see 5 tables:
- GuildConfig
- VerifiedUser
- UsageLog
- User
- Session

### 3. Database Indexes

The schema includes indexes on:
- `UsageLog.guildId`
- `UsageLog.discordId`
- `UsageLog.createdAt`
- `Session.expiresAt`

---

## Deployment Options

### Option A: VPS/VM (Recommended)

**Using PM2:**

```bash
# Install PM2
npm install -g pm2

# Build the project
npm run build

# Start with PM2
pm2 start dist/index.js --name "aquarium-bot"

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'aquarium-bot',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### Option B: Railway

1. Connect GitHub repository
2. Add PostgreSQL service
3. Configure environment variables
4. Deploy

### Option C: Render

1. Create Web Service
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Add environment variables

### Option D: Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist

EXPOSE 4001

CMD ["node", "dist/index.js"]
```

```bash
# Build
docker build -t aquarium-bot .

# Run
docker run -d \
  --name aquarium-bot \
  --env-file .env \
  -p 4001:4001 \
  aquarium-bot
```

---

## Post-Deployment

### 1. Deploy Slash Commands

Commands must be deployed to Discord after the bot is running:

```bash
npx ts-node src/deploy.ts
```

Or in production:
```bash
node dist/deploy.js
```

### 2. Verify Bot is Online

1. Check Discord Developer Portal → Bot status
2. Test `/ping` command in Discord
3. Test `/help` command

### 3. Test OAuth Flow

1. Visit `https://your-domain.com/auth/discord`
2. Authorize with Discord
3. Verify redirect works

### 4. Test Stripe Webhooks

Use Stripe CLI for local testing:
```bash
stripe listen --forward-to localhost:4001/webhooks/stripe
```

---

## Monitoring & Maintenance

### Health Checks

Add a health endpoint (not currently implemented - recommended addition):

```typescript
// Add to src/index.ts
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
```

### Recommended Monitoring

1. **Uptime Monitoring**: UptimeRobot, Better Uptime
2. **Error Tracking**: Sentry, LogRocket
3. **Metrics**: Prometheus + Grafana
4. **Logs**: Papertrail, Logtail

### Database Maintenance

```bash
# View database usage
npx prisma studio

# Clean expired sessions (recommended: run daily via cron)
# Add this query to a scheduled job:
DELETE FROM "Session" WHERE "expiresAt" < NOW();

# Backup database (Neon/Supabase handle this automatically)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Log Rotation

With PM2:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Security Considerations

### Critical Security Items

1. **Environment Variables**
   - Never commit `.env` to version control
   - Use secrets manager in CI/CD (GitHub Secrets, etc.)
   - Rotate `SESSION_SECRET` periodically

2. **HTTPS Required**
   - OAuth2 requires HTTPS in production
   - Use Let's Encrypt for free SSL certificates
   - Configure HSTS headers

3. **CORS Configuration**
   - Currently allows all origins
   - Restrict to specific domains in production:
   ```typescript
   app.use(cors({
     origin: process.env.DASHBOARD_URL,
     credentials: true
   }));
   ```

4. **Rate Limiting** (Not Currently Implemented)
   - Add API rate limiting to prevent abuse:
   ```bash
   npm install express-rate-limit
   ```

5. **Input Validation**
   - Validate all API inputs
   - Sanitize user-provided content

6. **Database Security**
   - Use connection pooling
   - Enable SSL for database connections
   - Use least-privilege database user

### Recommended Security Headers

```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

## Scaling Considerations

### Current Limitations

1. **Single Process**: Bot runs as single instance (Discord.js limitation for sharding)
2. **Database Sessions**: Using PostgreSQL for sessions (consider Redis)
3. **Synchronous Translation**: Each message blocks until all translations complete

### Scaling Recommendations

**For > 100 servers:**
- Implement Discord.js sharding
- Move sessions to Redis
- Add connection pooling (PgBouncer or built-in)

**For > 1000 servers:**
- Deploy multiple bot instances with sharding
- Use message queue for translations (Bull/Redis)
- Implement caching layer
- Consider dedicated DeepL API plan

**Session Storage Migration:**
```bash
npm install connect-redis redis
```

```typescript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  // ... other options
}));
```

---

## Known Limitations

### Functional Limitations
- Only 9 hardcoded languages supported
- No message edit/delete propagation
- No image/attachment translation
- Leaderboards limited to top 10 (no pagination)
- Achievements stored as JSON (not queryable)

### Technical Debt
- No test suite
- No request validation middleware
- Session storage in database (should be Redis)
- No structured logging
- No graceful shutdown handling

### Future Improvements
- [ ] Add test suite (Jest/Vitest)
- [ ] Implement request validation (Zod/Joi)
- [ ] Add structured logging (Winston/Pino)
- [ ] Implement graceful shutdown
- [ ] Add OpenTelemetry for distributed tracing
- [ ] Implement message queue for async translation
- [ ] Add pagination to leaderboards
- [ ] Support message edits/deletes
- [ ] Add more languages

---

## Troubleshooting

### Bot Not Coming Online
1. Check `TOKEN` is correct
2. Verify bot has required intents enabled
3. Check for errors in console/logs

### Commands Not Appearing
1. Run deploy script: `node dist/deploy.js`
2. Wait 1-2 minutes for Discord to propagate
3. Check `CLIENTID` and `GUILDID` are correct

### OAuth Not Working
1. Verify `DISCORD_CLIENT_SECRET` is correct
2. Check redirect URL matches exactly
3. Ensure `BASE_URL` includes correct protocol (https)

### Translations Not Working
1. Verify `DEEPL_API_KEY` is valid
2. Check DeepL API quota
3. Review error logs for specific failures

### Stripe Webhooks Failing
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Check webhook URL is accessible
3. Use Stripe CLI to test locally

---

## Support

For issues and feature requests, please open an issue on GitHub.
