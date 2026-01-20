# Aquarium - Discord Language Immersion Bot

A Discord bot that enables real-time multilingual communication across 9 language channels. When a user sends a message in one language channel, it's automatically translated and posted to all other language channels via webhooks.

## Features

### Core Translation
- **Automatic Translation** - Messages in one language channel are translated to 8 other languages in real-time
- **9 Supported Languages** - English, Spanish, Portuguese (BR), French, German, Italian, Japanese, Korean, Chinese
- **Webhook Distribution** - Translations maintain user's avatar and username across all channels
- **DeepL Integration** - High-quality machine translation via DeepL API

### Gamification & Engagement
- **Translation Streaks** - Track daily translation streaks with milestones (3, 7, 14, 30, 100 days)
- **13 Achievements** - Unlock achievements based on translations, streaks, and character counts
- **Leaderboards** - Monthly and all-time rankings by character count
- **User Profiles** - View stats, rank titles, and achievements

### Subscription System
- **Guild Subscriptions** - Server-wide plans (Free/Pro/Premium) with character limits
- **User Subscriptions** - Personal plans that work across all servers
- **Stripe Integration** - Checkout, billing portal, and webhook handling

### User Commands
| Command | Description |
|---------|-------------|
| `/ping` | Health check |
| `/help` | Feature overview and getting started guide |
| `/translate <text> <to> [from]` | Quick one-off translation |
| `/languages` | List all language channels and setup status |
| `/profile [user]` | View user profile, stats, and achievements |
| `/streak` | Check your translation streak |
| `/leaderboard [type]` | Server leaderboard (monthly/all-time) |
| `/phrase [language]` | Daily phrase in all 9 languages |
| `/subscribe plans` | View subscription tiers |
| `/subscribe status` | Check server subscription |
| `/usage` | View personal and server usage stats |
| `/funfact` | Random language learning fact |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/immersion setup [category]` | Create 9 language channels with webhooks |
| `/immersion status` | View setup status and statistics |
| `/immersion reset` | Delete all channels and reset configuration |

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Discord**: Discord.js v14
- **Database**: PostgreSQL with Prisma ORM
- **Translation**: DeepL API
- **Payments**: Stripe
- **Auth**: Passport.js with Discord OAuth2
- **Web Server**: Express.js

## Project Structure

```
src/
├── index.ts              # Express server entry point
├── client.ts             # Discord.js client setup
├── deploy.ts             # Slash command deployment
├── commands/             # Slash commands
│   ├── immersion/        # Admin setup commands
│   └── *.ts              # User commands
├── config/
│   ├── constants.ts      # Rate limits, URLs, prefixes
│   ├── languages.ts      # Language definitions
│   ├── subscriptions.ts  # Tier configuration
│   └── achievements.ts   # Achievement definitions
├── database/
│   └── prisma.ts         # Prisma client singleton
├── events/
│   ├── index.ts          # Event registration
│   └── messageCreate.ts  # Core translation logic
├── services/
│   ├── deepl.ts          # DeepL API wrapper
│   ├── translation.ts    # Batch translation service
│   ├── webhook.ts        # Discord webhook management
│   └── stripe.ts         # Stripe integration
└── web/
    ├── routes/
    │   ├── auth.ts       # Discord OAuth endpoints
    │   └── api.ts        # REST API for dashboard
    └── middleware/
        └── auth.ts       # Auth middleware
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Discord Application with Bot
- DeepL API account
- Stripe account (optional, for subscriptions)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd lebron-bot
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Setup database
npx prisma db push
npx prisma generate

# Deploy commands to Discord
npx ts-node src/deploy.ts

# Run in development
npm run dev

# Run in production
npm run build
npm start
```

## Environment Variables

See `.env.example` for all required variables. Key configurations:

| Variable | Required | Description |
|----------|----------|-------------|
| `TOKEN` | Yes | Discord bot token |
| `CLIENTID` | Yes | Discord application client ID |
| `GUILDID` | Yes | Discord guild ID for command deployment |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth2 client secret |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DEEPL_API_KEY` | Yes | DeepL API key |
| `SESSION_SECRET` | Yes | Express session secret (use strong random value) |
| `BASE_URL` | Yes | Backend URL (e.g., `https://api.example.com`) |
| `DASHBOARD_URL` | Yes | Frontend dashboard URL |
| `STRIPE_*` | No | Stripe keys (required for subscriptions) |

## Subscription Tiers

### Guild Plans
| Tier | User Limit | Guild Limit | Price |
|------|-----------|-------------|-------|
| Free | 5K chars/mo | 25K chars/mo | $0 |
| Pro | 25K chars/mo | 150K chars/mo | $9.99/mo |
| Premium | 100K chars/mo | 500K chars/mo | $24.99/mo |

### User Plans
Personal subscriptions that work across all servers with the same limits.

## API Endpoints

The bot exposes a REST API for the dashboard:

### Authentication
- `GET /auth/discord` - Initiate OAuth
- `GET /auth/discord/callback` - OAuth callback
- `GET /auth/logout` - Logout

### User Data
- `GET /api/auth/me` - Current user info
- `GET /api/guilds` - User's guilds where bot exists
- `GET /api/usage` - Usage across all servers
- `GET /api/achievements` - All achievements

### Guild Management
- `POST /api/guilds/:id/verify` - Verify user in guild
- `GET /api/guilds/:id/subscription` - Subscription status
- `GET /api/guilds/:id/profile` - User profile in guild
- `GET /api/guilds/:id/leaderboard` - Guild leaderboard

### Subscriptions
- `POST /api/guilds/:id/subscription/checkout` - Create checkout session
- `POST /api/guilds/:id/subscription/portal` - Billing portal
- `DELETE /api/guilds/:id/subscription` - Cancel subscription

## Database Schema

### Models
- **GuildConfig** - Server configuration, channel IDs, webhooks, subscription
- **VerifiedUser** - Per-guild user verification, stats, streaks, achievements
- **UsageLog** - Translation audit trail
- **User** - Global user data and personal subscription
- **Session** - Express session storage

## Development

```bash
# Start with hot reload
npm run dev

# View database
npm run db:studio

# Apply schema changes
npm run db:push

# Generate Prisma client
npm run db:generate
```

## License

ISC
