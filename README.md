<h1 align="center">AlphoGenAI Mini</h1>

<p align="center">
 AI-powered video generation SaaS built with Next.js, Supabase, and LangGraph
</p>

<p align="center">
  <strong>SVI (Stable Video Infinity)</strong> → <strong>AudioLDM2</strong> → <strong>Audio Mixing</strong>
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
- **SVI (Stable Video Infinity)** - Text-to-video generation on Runpod A100 80GB
- **AudioLDM2** - Text-to-audio generation with CLAP scoring
- **Audio Mixing** - ffmpeg-based audio/video mixing with normalization

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

1. **User submits a prompt** via the web interface at `/generate`
2. **Job created** in Supabase with status tracking
3. **SVI + Audio orchestrator** processes the job:
   - SVI generates video from text prompt (60s, 1920x1080, 24fps)
   - AudioLDM2 generates ambient audio from prompt
   - CLAP scoring selects best audio match
   - ffmpeg mixes video and audio with normalization (-16 LUFS)
   - State saved in `jobs` table after each step
4. **User tracks progress** at `/jobs/[jobId]` with real-time polling
5. **User views** their AI-generated video with audio

## Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- Supabase account ([create one here](https://database.new))
- Runpod account with SVI and Audio endpoints deployed

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
- `RUNPOD_API_KEY` - Your Runpod API key
- `SVI_ENDPOINT_URL` - SVI endpoint URL (e.g., https://xxx.api.runpod.ai/)
- `AUDIO_BACKEND_URL` - Audio service endpoint URL (e.g., https://xxx.api.runpod.ai/)

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

### Generate a Video via Web Interface

1. Navigate to `/generate`
2. Enter your prompt
3. Configure video settings (duration, resolution, fps)
4. Click "Générer"
5. Track progress at `/jobs/[jobId]`
6. View final video with audio when complete

### Generate a Video via API

```bash
curl -X POST https://your-app.com/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a video about AI innovations in 2024",
    "duration_sec": 60,
    "resolution": "1920x1080",
    "fps": 24
  }'
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
│   ├── worker.py                # Background job processor
│   ├── svi_client.py            # SVI video generation client
│   ├── audio_orchestrator.py   # Audio generation orchestrator
│   ├── budget_guard.py          # Cost control and budget guards
│   ├── supabase_client.py       # Database client (jobs table)
│   ├── config.py                # Configuration management
│   └── app.py                   # FastAPI assembly service
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
4. **Worker Logic** - Modify `workers/worker.py` or orchestrators

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
- **Storage**: Supabase Storage + Cloudflare R2
- **Orchestration**: Async Python worker
- **AI Services**: SVI (text-to-video) + AudioLDM2 (text-to-audio)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for your own purposes.

## Music Attribution

Background music provided by:
- **Kevin MacLeod** ([incompetech.com](https://incompetech.com))
- Licensed under Creative Commons: By Attribution 4.0 License
- All music tracks are royalty-free and available for commercial use

Music is automatically selected based on video tone and downloaded directly from incompetech.com during video generation.

## Acknowledgments

Built with:
- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [Runpod](https://runpod.io/) - SVI and Audio endpoints
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Support

- 📖 [Documentation](workers/README.md)
- 💬 [Discussions](https://github.com/your-repo/discussions)
- 🐛 [Issue Tracker](https://github.com/your-repo/issues)
