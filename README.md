<h1 align="center">AlphoGenAI Mini</h1>

<p align="center">
 AI-powered video generation SaaS built with Next.js, Supabase, and LangGraph
</p>

<p align="center">
  <strong>Qwen Mock</strong> → <strong>Runway Gen-4 Turbo</strong> → <strong>Free Music</strong>
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a>
  <a href="#more-supabase-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

### 🎬 AI Video Generation Pipeline
- **Qwen Mock** - Script structure generation (no API calls)
- **Runway Gen-4 Turbo** - Direct text-to-video generation (10s, 16:9)
- **Free Music** - YouTube Audio Library tracks from Supabase Storage

### 🔄 Simplified Orchestration
- **Async Workflow** - Minimal worker with direct job processing
- **Job Persistence** - Supabase-backed job tracking
- **Smart Caching** - Avoid regenerating identical videos
- **Retry Logic** - Robust error handling
- **Webhook Notifications** - Optional real-time updates

### 🔐 Full-Stack Foundation
- **Next.js 15** - App Router, Server Components, API Routes
- **Supabase** - Authentication, Database (Postgres), Storage
- **TypeScript** - Type-safe development
- **shadcn/ui** - Beautiful, accessible UI components
- **Tailwind CSS** - Modern styling system

### 🛡️ Security & Auth
- Email-based authentication with confirmation
- Row Level Security (RLS) on all tables
- Protected routes with middleware
- Secure API key management

## How It Works

1. **User submits a prompt** via the web interface at `/creator/generate`
2. **Job created** in Supabase with status tracking
3. **Runway orchestrator** processes the job:
   - Qwen Mock generates script structure
   - Runway Gen-4 Turbo creates video (10s, 16:9)
   - Music selected from Supabase Storage by tone
   - State saved in `jobs.app_state` after each step
4. **Webhook notification** sent when video is ready (optional)
5. **User views** their AI-generated video at `/v/[jobId]`

## Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- Supabase account ([create one here](https://database.new))
- Runway Gen-4 Turbo API key

### 2. Clone and Install

```bash
git clone <repository-url>
cd alphogenai-mini

# Install Node.js dependencies
npm install

# Install Python dependencies
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 3. Configure Environment

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `RUNWAY_API_KEY` - Runway Gen-4 Turbo API key
- `RUNWAY_API_BASE` - Runway API base URL (default: https://api.runwayml.com/v1)
- `QWEN_MOCK_ENABLED` - Set to true for mock mode (default: true)

### 4. Run Database Migrations

Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) and run:

```sql
-- File: supabase/migrations/20251002_add_notes.sql (notes table)
-- File: supabase/migrations/20251004_jobs_table.sql (jobs table avec app_state)
```

### 5. Start the Application

**Terminal 1 - Next.js Frontend:**
```bash
npm run dev
```

**Terminal 2 - Python Worker:**
```bash
cd workers
./start_worker.sh  # Unix/Mac
# or
start_worker.bat   # Windows
```

The app will be available at [http://localhost:3000](http://localhost:3000)

### 6. Verify Setup

```bash
cd workers
python -m workers.test_setup
```

This will verify all API keys and database tables are configured correctly.

## Usage

### Generate a Video via Python

```python
import asyncio
from workers.runway_orchestrator import create_and_run_job

async def main():
    result = await create_and_run_job(
        user_id="user_123",
        prompt="Create a video about AI innovations in 2024"
    )
    
    if result['status'] == 'success':
        print(f"Video ready: {result['video_url']}")
    else:
        print(f"Error: {result['error']}")

asyncio.run(main())
```

### Generate a Video via CLI

```bash
cd workers
python -m workers.runway_orchestrator "Your prompt here"
```

### Check Job Status (SQL)

```sql
SELECT id, status, current_stage, video_url 
FROM jobs 
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;
```

## Project Structure

```
alphogenai-mini/
├── app/                          # Next.js App Router
│   ├── api/                     # API routes
│   ├── auth/                    # Authentication pages
│   ├── notes/                   # Notes feature (demo)
│   └── uploads/                 # File upload feature (demo)
├── workers/                      # Python async orchestrator
│   ├── runway_orchestrator.py   # Main workflow (Runway)
│   ├── runway_service.py        # Runway Gen-4 API wrapper
│   ├── qwen_mock_service.py     # Mock script generator
│   ├── music_selector.py        # Music selection logic
│   ├── supabase_client.py       # Database client (jobs table)
│   ├── worker.py                # Background job processor
│   └── README.md                # Worker documentation
├── components/                   # React UI components
├── lib/                         # Utilities
├── supabase/
│   └── migrations/
│       ├── 20251002_add_notes.sql
│       └── 20251004_jobs_table.sql  # Jobs avec app_state
└── .env.local                   # Environment variables (create this)
```

## Database Schema

### `jobs` Table
- `id` - UUID primary key
- `user_id` - Foreign key to auth.users
- `prompt` - User's video generation prompt
- `status` - pending | in_progress | completed | failed
- `app_state` - **Complete workflow state (JSONB)**
- `current_stage` - Current pipeline stage (script_generation, video_generation, music_selection, completed)
- `error_message` - Error details if failed
- `retry_count` - Number of retry attempts
- `video_url` - Final video URL when completed
- `created_at` - Job creation timestamp
- `updated_at` - Last update timestamp

**Why `app_state`?**  
The complete workflow state is saved at each step, enabling:
- Resume after failures
- Debugging with full context
- Access to all intermediate results (script, video, music)

## Deployment

### Vercel (Frontend)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables from `.env.local`
4. Deploy

### Python Worker (Background)

Deploy to any platform that supports Python:
- **Heroku** - `heroku ps:scale worker=1`
- **Railway** - Background worker service
- **AWS EC2** - Run as systemd service
- **Docker** - Use provided Dockerfile (create one)

## Development

### Adding New Features

1. **Frontend** - Add pages in `app/` directory
2. **API Routes** - Create in `app/api/` directory
3. **Components** - Add to `components/` directory
4. **Worker Logic** - Modify `workers/runway_orchestrator.py`

### Testing

```bash
# Frontend
npm run lint
npm run build

# Worker
cd workers
python -m pytest tests/
```

## Troubleshooting

See [workers/README.md](workers/README.md) for detailed troubleshooting guide.

Common issues:
- **API keys not working** - Verify keys in `.env.local`
- **Database connection failed** - Check Supabase credentials
- **Worker not processing jobs** - Ensure worker is running
- **Video generation timeout** - Increase `JOB_TIMEOUT` in config

## Architecture

AlphoGenAI Mini uses a hybrid architecture:

- **Frontend**: Next.js 15 with Server Components
- **Backend**: Next.js API Routes + Python Workers
- **Database**: Supabase (PostgreSQL with RLS)
- **Storage**: Supabase Storage (music files)
- **Orchestration**: Async Python worker
- **AI Services**: Runway Gen-4 Turbo (text-to-video)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for your own purposes.

## Acknowledgments

Built with:
- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [Runway Gen-4 Turbo](https://runwayml.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Support

- 📖 [Documentation](workers/README.md)
- 💬 [Discussions](https://github.com/your-repo/discussions)
- 🐛 [Issue Tracker](https://github.com/your-repo/issues)
