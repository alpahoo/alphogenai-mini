# AlphoGenAI Mini - LangGraph Orchestrator

Python-based video generation orchestrator using LangGraph to manage the AI pipeline.

## Pipeline Stages

The orchestrator manages the following pipeline:

1. **Qwen (Script Generation)** - Generates creative video script with scene descriptions
2. **WAN Image (Key Visual)** - Creates a cinematic key visual from the first scene
3. **Pika (Video Clips)** - Generates 4 video clips (5 seconds each)
4. **ElevenLabs (Audio + SRT)** - Creates voiceover with synchronized subtitles
5. **Remotion (Final Assembly)** - Renders the complete video with all assets

## Setup

### 1. Install Python Dependencies

```bash
cd workers
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy the provided `.env.local` file to the project root and fill in your API keys:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# AI Services
QWEN_API_KEY=your-qwen-key
WAN_IMAGE_API_KEY=your-wan-key
PIKA_API_KEY=your-pika-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### 3. Run Database Migrations

Execute the SQL migration in your Supabase SQL Editor:

```sql
-- File: supabase/migrations/20251004_video_generation_tables.sql
```

This creates:
- `video_cache` table - Job persistence and caching
- `video_artifacts` table - Intermediate pipeline artifacts
- RLS policies for security
- Indexes for performance

### 4. Start Remotion Renderer (Optional)

If using local Remotion rendering:

```bash
# In a separate terminal
cd remotion
npm install
npm start
```

## Usage

### From Python

```python
import asyncio
from workers.langgraph_orchestrator import create_and_run_job

async def main():
    result = await create_and_run_job(
        user_id="user_123",
        prompt="Create a 20-second video about AI innovations in 2024"
    )
    print(f"Video URL: {result['video_url']}")

asyncio.run(main())
```

### From Command Line

```bash
python -m workers.langgraph_orchestrator "Create a video about space exploration"
```

### From Next.js API Route

Create an API endpoint to trigger jobs:

```typescript
// app/api/generate-video/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Trigger Python worker (via queue, webhook, or direct execution)
  // For now, insert job into database and have worker poll
  const { data: job } = await supabase
    .from('video_cache')
    .insert({
      user_id: user.id,
      prompt: prompt,
      status: 'pending'
    })
    .select()
    .single();

  return NextResponse.json({ job_id: job.id });
}
```

## Features

### ✅ Job Persistence
- All jobs stored in Supabase with RLS security
- Track status: `pending`, `in_progress`, `completed`, `failed`

### ✅ Caching
- Automatically checks for previously generated videos with same prompt
- Reduces API costs and generation time

### ✅ Retry Logic
- Configurable retry attempts (default: 3)
- Exponential backoff for API failures
- Saves progress at each stage

### ✅ Artifact Storage
- Intermediate results saved per stage
- Resume from last successful stage on retry
- Debug and inspect pipeline outputs

### ✅ Webhook Notifications
- Optional webhook when video is ready
- Includes job metadata and video URL
- Secure with HMAC signature

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  LangGraph Workflow                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐      ┌─────────────┐                │
│  │  Qwen    │─────▶│  WAN Image  │                │
│  │ (Script) │      │(Key Visual) │                │
│  └──────────┘      └─────────────┘                │
│                            │                        │
│                            ▼                        │
│                    ┌─────────────┐                │
│                    │    Pika     │                │
│                    │  (4 Clips)  │                │
│                    └─────────────┘                │
│                            │                        │
│                            ▼                        │
│                    ┌─────────────┐                │
│                    │ ElevenLabs  │                │
│                    │(Audio + SRT)│                │
│                    └─────────────┘                │
│                            │                        │
│                            ▼                        │
│                    ┌─────────────┐                │
│                    │  Remotion   │                │
│                    │  (Assembly) │                │
│                    └─────────────┘                │
│                            │                        │
│                            ▼                        │
│                    ┌─────────────┐                │
│                    │   Webhook   │                │
│                    │   Notify    │                │
│                    └─────────────┘                │
│                                                     │
└─────────────────────────────────────────────────────┘
           ▲                          │
           │                          │
           │     ┌──────────────┐    │
           └─────│   Supabase   │◀───┘
                 │  (Postgres)  │
                 └──────────────┘
```

## API Service Documentation

### Qwen (Script Generation)
- Model: `qwen-plus`
- Generates structured scenes with descriptions and narration
- Automatically limits to 4 scenes for optimal video length

### WAN Image (Key Visual)
- Resolution: 1920x1080 (16:9)
- Style: Cinematic
- Uses first scene description

### Pika (Video Clips)
- Duration: 5 seconds per clip
- Aspect ratio: 16:9
- Parallel generation for efficiency
- First clip uses key visual as seed

### ElevenLabs (Text-to-Speech)
- Model: `eleven_multilingual_v2`
- Voice: Configurable (default: professional narrator)
- Generates SRT captions with timing

### Remotion (Video Assembly)
- Format: MP4 (H.264)
- Combines clips, audio, and subtitles
- Supports custom compositions

## Monitoring

Check job status:

```python
from workers.supabase_client import SupabaseClient

supabase = SupabaseClient()
job = await supabase.get_job("job-uuid")
print(f"Status: {job['status']}, Stage: {job['current_stage']}")
```

View statistics:

```sql
SELECT * FROM video_generation_stats WHERE user_id = 'user-uuid';
```

## Error Handling

The orchestrator implements robust error handling:

1. **Stage Failures** - Retry with exponential backoff
2. **API Timeouts** - Configurable timeout per service
3. **Network Errors** - Automatic retry with delay
4. **Validation Errors** - Clear error messages in job record

## Performance

Expected generation times:
- Script: 5-10 seconds
- Key Visual: 10-20 seconds
- 4 Video Clips: 2-5 minutes (parallel)
- Audio + SRT: 10-30 seconds
- Final Assembly: 1-3 minutes

**Total**: ~4-9 minutes per video

## Troubleshooting

### Common Issues

**1. API Key Invalid**
```
Error: Authentication failed for [service]
Solution: Check API key in .env.local
```

**2. Supabase Connection Failed**
```
Error: Could not connect to Supabase
Solution: Verify SUPABASE_URL and SUPABASE_SERVICE_KEY
```

**3. Job Stuck in 'in_progress'**
```
Solution: Check worker logs, may need to restart job
```

**4. Remotion Renderer Not Available**
```
Error: Connection refused to REMOTION_RENDERER_URL
Solution: Start Remotion renderer or update URL
```

## Development

### Running Tests

```bash
pytest workers/tests/
```

### Debugging

Enable verbose logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Adding New Pipeline Stages

1. Create service wrapper in `api_services.py`
2. Add node method in `langgraph_orchestrator.py`
3. Update workflow graph connections
4. Add database migration for artifacts

## License

MIT
