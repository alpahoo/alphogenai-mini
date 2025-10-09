<h1 align="center">AlphoGenAI Mini</h1>

<p align="center">
 AI-powered video generation SaaS built with Next.js, Supabase, and LangGraph
</p>

<p align="center">
  <strong>Qwen</strong> → <strong>WAN Image</strong> → <strong>Pika</strong> → <strong>ElevenLabs</strong> → <strong>Remotion</strong>
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
- **Qwen LLM** - Intelligent script generation with scene breakdown
- **WAN Image** - Cinematic key visual generation
- **Pika** - 4-clip video generation with AI-powered motion
- **ElevenLabs** - Professional voiceover with automatic SRT subtitles
- **Remotion** - Final video assembly and rendering

### 🔄 LangGraph Orchestration
- **Workflow Management** - Automated pipeline with state management
- **Job Persistence** - Supabase-backed job tracking
- **Smart Caching** - Avoid regenerating identical videos
- **Retry Logic** - Robust error handling with exponential backoff
- **Webhook Notifications** - Real-time updates when videos are ready

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

1. **User submits a prompt** via the web interface
2. **Job created** in Supabase with status tracking
3. **LangGraph orchestrator** processes the job through 5 stages:
   - Qwen generates a creative script with 4 scenes
   - WAN Image creates a cinematic key visual
   - Pika generates 4 video clips (4 seconds each, with --image + seed for consistency)
   - ElevenLabs produces voiceover + SRT subtitles
   - Remotion assembles the final video
   - State saved in `jobs.app_state` after each step
4. **Webhook notification** sent when video is ready
5. **User downloads** their AI-generated video

## Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- Supabase account ([create one here](https://database.new))
- API keys for: Qwen, WAN Image, Pika, ElevenLabs

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
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `ADMIN_TOKEN` - Secret token for admin API updates
- `SUPABASE_STORAGE_BUCKET` - Storage bucket used for music assets (e.g. `music`)
- `QWEN_API_KEY` - Qwen/Alibaba Cloud API key
- `WAN_IMAGE_API_KEY` - WAN Image API key
- `PIKA_API_KEY` - Pika API key
- `ELEVENLABS_API_KEY` - ElevenLabs API key

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
from workers.langgraph_orchestrator import create_and_run_job

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
python -m workers.langgraph_orchestrator "Your prompt here"
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
├── workers/                      # Python LangGraph orchestrator
│   ├── langgraph_orchestrator.py  # Main workflow (LangGraph)
│   ├── api_services.py          # AI service wrappers
│   ├── supabase_client.py       # Database client (jobs table)
│   ├── worker.py                # Background job processor
│   ├── test_setup.py            # Setup verification
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
- `app_state` - **Complete LangGraph workflow state (JSONB)**
- `current_stage` - Current pipeline stage (qwen, wan_image, pika, elevenlabs, remotion)
- `error_message` - Error details if failed
- `retry_count` - Number of retry attempts
- `video_url` - Final video URL when completed
- `created_at` - Job creation timestamp
- `updated_at` - Last update timestamp

**Why `app_state`?**  
The complete LangGraph workflow state is saved at each step, enabling:
- Resume after failures
- Debugging with full context
- Access to all intermediate results (script, key visual, clips, audio)

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
4. **Worker Logic** - Modify `workers/langgraph_orchestrator.py`

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
- **Storage**: Supabase Storage (for uploads)
- **Orchestration**: LangGraph (Python)
- **AI Services**: External APIs (Qwen, WAN, Pika, ElevenLabs, Remotion)

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
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Support

- 📖 [Documentation](workers/README.md)
- 💬 [Discussions](https://github.com/your-repo/discussions)
- 🐛 [Issue Tracker](https://github.com/your-repo/issues)
