<h1 align="center">AlphoGenAI Mini</h1>

<p align="center">
 AI-powered video generation SaaS built with Next.js, Supabase, and a Python worker
</p>

<p align="center">
  <strong>UI</strong> → <strong>Jobs</strong> → <strong>Worker</strong> → <strong>Modal Video Backend</strong> → <strong>Storage</strong> → <strong>Playback</strong>
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
- **Single Video Backend (Modal)** - one happy path, no experimental backends
- **MockBackend by default (local/CI)** - uploads a 1s dummy MP4 to validate plumbing
- **Supabase Storage (public read)** - bucket `generated` (V1)

### 🔄 Simplified Orchestration
- **Worker = brain** - minimal orchestration, no video generation in Next.js
- **Job Persistence** - Supabase-backed job tracking
- **Smart Caching** - Avoid regenerating identical videos (hash includes prompt + params)
- **Retry Logic** - Robust error handling

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

1. **User submits a prompt** via `/generate` (auth)
2. **Job created** in Supabase (`jobs.status=pending`)
3. **Worker** processes:
   - cache lookup (`video_cache` via SHA-256(stable JSON: prompt+duration+fps+resolution+seed))
   - video generation via **Modal backend** (or MockBackend locally)
   - worker updates `jobs` (`output_url_final`, `final_url`)
4. **User tracks progress** at `/jobs/[id]` (polling)

## Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- Supabase account ([create one here](https://database.new))
- Modal account (for production video backend)

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
- `SUPABASE_BUCKET` - Storage bucket (default: `generated`)
- `VIDEO_BACKEND` - `mock` (default local/CI) or `modal` (production)
- `MODAL_VIDEO_ENDPOINT_URL` - Modal web endpoint URL (required when `VIDEO_BACKEND=modal`)

### 4. Run Database Migrations

Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) and run:

```sql
-- File: supabase/migrations/20251002_add_notes.sql (notes table)
-- File: supabase/migrations/20251004_jobs_table.sql (jobs table avec app_state)
-- File: supabase/migrations/20260106_create_generated_bucket.sql (Storage bucket "generated" public read)
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
python3 tools/e2e_test_v1.py
```

This will create a job, run the worker once, and verify the final MP4 URL is accessible.

## Usage

### Generate a Video via Web Interface

1. Navigate to `/generate`
2. Enter your prompt
3. Configure video settings (duration, resolution, fps)
4. Click "Générer"
5. Track progress at `/jobs/[id]`
6. View final video when complete

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
│   └── generate/                # Video generation UI
├── workers/                      # Python async orchestrator
│   ├── worker.py                # Background job processor
│   ├── video_backend/           # VideoBackend (mock|modal)
│   ├── supabase_client.py       # Database client (jobs table)
│   ├── config.py                # Configuration management
│   └── requirements.txt
├── services/
│   └── video_modal/             # Modal video backend (serverless)
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
- `status` - pending | in_progress | done | failed | cancelled
- `app_state` - **Complete workflow state (JSONB)**
- `current_stage` - Current stage (e.g. starting, video_generated, completed)
- `error_message` - Error details if failed
- `retry_count` - Number of retry attempts
- `video_url` - Generated video URL (source)
- `output_url_final` - Final video URL (public MP4)
- `final_url` - Legacy alias (usually equals `output_url_final`)
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

# E2E (no GPU, MockBackend)
python3 tools/e2e_test_v1.py
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
- **Storage**: Supabase Storage (bucket `generated`, public read in V1)
- **Orchestration**: Async Python worker
- **AI Services**: Modal video backend (serverless)

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
- [Modal](https://modal.com/) - video backend (serverless)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Support

- 📖 [Documentation](workers/README.md)
- 💬 [Discussions](https://github.com/your-repo/discussions)
- 🐛 [Issue Tracker](https://github.com/your-repo/issues)
