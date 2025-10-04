# LangGraph Orchestrator Setup - Complete ✅

This document provides a summary of the LangGraph workflow orchestrator setup for AlphoGenAI Mini.

## 📁 Files Created

### Python Workers (`/workers/`)
- ✅ `__init__.py` - Package initialization
- ✅ `langgraph_orchestrator.py` - Main LangGraph workflow (5-stage pipeline)
- ✅ `api_services.py` - API wrappers for Qwen, WAN Image, Pika, ElevenLabs, Remotion
- ✅ `supabase_client.py` - Supabase client for job persistence and caching
- ✅ `config.py` - Environment configuration management
- ✅ `worker.py` - Background worker that polls for pending jobs
- ✅ `test_setup.py` - Setup verification script
- ✅ `requirements.txt` - Python dependencies
- ✅ `README.md` - Comprehensive documentation
- ✅ `.gitignore` - Python gitignore
- ✅ `start_worker.sh` - Unix/Mac startup script
- ✅ `start_worker.bat` - Windows startup script

### Next.js API Routes (`/app/api/`)
- ✅ `generate-video/route.ts` - API endpoint to create and check video jobs

### Database Migrations (`/supabase/migrations/`)
- ✅ `20251004_video_generation_tables.sql` - Creates `video_cache` and `video_artifacts` tables with RLS

### Configuration Files
- ✅ `.env.local` - Environment variables with placeholder API keys
- ✅ `.env.example` - Example environment file
- ✅ `README.md` - Updated main README with AlphoGenAI Mini features

## 🔄 Pipeline Architecture

The LangGraph orchestrator manages this 5-stage pipeline:

```
┌─────────────┐
│    User     │
│   Prompt    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│           LangGraph Workflow                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Stage 1: Qwen (Script Generation)             │
│  ├─ Input: User prompt                         │
│  └─ Output: 4 scenes with descriptions         │
│                                                 │
│  Stage 2: WAN Image (Key Visual)               │
│  ├─ Input: First scene description             │
│  └─ Output: 1920x1080 cinematic image          │
│                                                 │
│  Stage 3: Pika (Video Clips)                   │
│  ├─ Input: 4 scene descriptions + key visual   │
│  └─ Output: 4x 5-second video clips            │
│                                                 │
│  Stage 4: ElevenLabs (Audio + Subtitles)       │
│  ├─ Input: Full narration text                 │
│  └─ Output: Audio file + SRT subtitles         │
│                                                 │
│  Stage 5: Remotion (Final Assembly)            │
│  ├─ Input: Clips, audio, subtitles             │
│  └─ Output: Final MP4 video                    │
│                                                 │
│  Stage 6: Webhook Notification                 │
│  └─ Sends completion notification              │
│                                                 │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   Supabase  │
│  (Storage)  │
│  video_cache│
│ video_art...│
└─────────────┘
```

## 🎯 Key Features

### ✅ Job Persistence
- All jobs stored in `video_cache` table
- Status tracking: `pending` → `in_progress` → `completed`/`failed`
- Automatic timestamps and metadata

### ✅ Smart Caching
- Checks for previously generated videos with same prompt
- Reduces API costs and generation time
- Per-user caching with RLS security

### ✅ Retry Logic
- Configurable retry attempts (default: 3)
- Exponential backoff for API failures
- Saves progress at each stage via `video_artifacts`

### ✅ Artifact Storage
- Each stage saves intermediate results
- Enables resume from last successful stage
- Debugging and inspection of pipeline outputs

### ✅ Webhook Notifications
- Optional webhook when video is ready
- Includes job metadata and video URL
- Secure with HMAC signature support

### ✅ Row Level Security (RLS)
- Users can only access their own jobs
- Service role has full access for workers
- Secure by default

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Update `.env.local` with your API keys:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# AI Services
QWEN_API_KEY=your-qwen-key
WAN_IMAGE_API_KEY=your-wan-key
PIKA_API_KEY=your-pika-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### 3. Run Database Migration

Open Supabase SQL Editor and execute:
```sql
-- File: supabase/migrations/20251004_video_generation_tables.sql
```

### 4. Test Setup

```bash
cd workers
python -m workers.test_setup
```

### 5. Start Worker

```bash
# Unix/Mac
./start_worker.sh

# Windows
start_worker.bat
```

### 6. Create Video Job

**Option A: Via API**
```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Create a video about AI"}'
```

**Option B: Direct Python**
```bash
python -m workers.langgraph_orchestrator "Your prompt here"
```

## 📊 Database Tables

### `video_cache`
```sql
CREATE TABLE video_cache (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    current_stage TEXT,
    error_message TEXT,
    result JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### `video_artifacts`
```sql
CREATE TABLE video_artifacts (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES video_cache(id),
    stage TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ
);
```

## 🔧 Configuration Options

### Worker Settings (.env.local)

```bash
# Retry configuration
MAX_RETRIES=3              # Max retry attempts per stage
RETRY_DELAY=5              # Delay between retries (seconds)
JOB_TIMEOUT=3600           # Job timeout (seconds)

# Worker polling
POLL_INTERVAL=10           # How often to check for new jobs

# Webhook
WEBHOOK_URL=https://...    # Optional completion webhook
WEBHOOK_SECRET=secret      # Optional webhook signature
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/generate-video` | POST | Create new video job |
| `/api/generate-video?job_id=...` | GET | Check job status |

## 📈 Performance Expectations

Expected generation times per stage:

| Stage | Time | Notes |
|-------|------|-------|
| Qwen (Script) | 5-10s | LLM generation |
| WAN Image | 10-20s | Image generation |
| Pika (4 clips) | 2-5min | Parallel generation |
| ElevenLabs | 10-30s | TTS + SRT |
| Remotion | 1-3min | Video assembly |
| **Total** | **4-9min** | Full pipeline |

## 🐛 Troubleshooting

### Common Issues

1. **"API key invalid"**
   - Check `.env.local` has correct keys
   - Ensure no quotes around key values

2. **"Supabase connection failed"**
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
   - Check service role key has correct permissions

3. **"Table does not exist"**
   - Run the database migration in Supabase SQL Editor
   - File: `supabase/migrations/20251004_video_generation_tables.sql`

4. **"Worker not processing jobs"**
   - Ensure worker is running: `python -m workers.worker`
   - Check worker logs for errors
   - Verify job status in database

5. **"Job stuck in 'in_progress'"**
   - Worker may have crashed
   - Check error_message in video_cache table
   - Manually set status to 'failed' to retry

### Debug Mode

Enable verbose logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 🔒 Security Considerations

1. **Never commit `.env.local`** - Contains sensitive API keys
2. **Use service role key** - For worker processes only
3. **Enable RLS** - Automatically applied by migration
4. **Webhook signatures** - Use `WEBHOOK_SECRET` for verification
5. **Rate limiting** - Consider adding to API routes

## 🎓 Next Steps

### Recommended Improvements

1. **Add Frontend UI**
   - Create video generation page
   - Real-time status updates (polling or websockets)
   - Video preview and download

2. **Queue System**
   - Replace database polling with Redis/RabbitMQ
   - Better scalability and real-time processing

3. **Storage Integration**
   - Upload audio to Supabase Storage
   - Store final videos in Supabase Storage
   - Generate signed URLs for downloads

4. **Rate Limiting**
   - Implement per-user rate limits
   - Prevent API abuse

5. **Monitoring**
   - Add logging service (Sentry, LogRocket)
   - Track success/failure rates
   - Monitor API costs

6. **Testing**
   - Unit tests for each service
   - Integration tests for pipeline
   - Mock API responses for testing

## 📚 Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Workers README](workers/README.md) - Detailed worker documentation

## ✅ Setup Checklist

- [ ] Python 3.9+ installed
- [ ] Node.js 18+ installed
- [ ] Supabase project created
- [ ] API keys obtained (Qwen, WAN Image, Pika, ElevenLabs)
- [ ] `.env.local` configured
- [ ] Database migrations run
- [ ] Python dependencies installed
- [ ] Setup verification passed (`python -m workers.test_setup`)
- [ ] Worker started successfully
- [ ] Test job created and processed

---

**Setup completed on:** 2025-10-04  
**Version:** 1.0.0  
**Status:** ✅ Ready for development
