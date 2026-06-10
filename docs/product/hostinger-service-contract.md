# Hostinger VPS Service Contract

**Status:** Draft for validation  
**Owner:** Infrastructure / AlphoResearch (T-1100b)  
**Scope:** Documentation of auxiliary services, env vars, health checks, failure modes  
**No app code, no migrations — this document defines the contract only.**

---

## Overview

Hostinger VPS hosts auxiliary research and support services for AlphoResearch. The VPS is **not** the production application or database — that remains Vercel (Next.js) and Supabase Cloud.

**Responsibilities:**
- SearXNG: Private meta-search discovery
- Crawl4AI: Readable content extraction (Markdown)
- changedetection.io: Monitored source watchlists (Phase 4)
- Speaches/Kokoro: Low-cost voice-over experiments (Phase 3+)
- Redis/Dragonfly: Optional cache, rate limits, light queues

**Out of scope:**
- Production Supabase or PostgreSQL replacement
- Production Next.js application server
- GPU-heavy video/image synthesis
- n8n orchestration
- Public-facing APIs

---

## Architecture Review Addendum

Before implementation, the network contract needs one correction: Vercel cannot call
`*.alphoresearch.internal` names that resolve to `127.0.0.1` on the VPS. From Vercel,
`127.0.0.1` is the Vercel runtime itself, not Hostinger. Also, whitelisting Vercel
outbound IPs is not a stable security boundary for most Vercel deployments.

Recommended production-safe access pattern:

```text
Vercel /api/research/*
  |
  | HTTPS + service token
  v
Hostinger edge gateway
  |
  | private Docker network
  +-- SearXNG
  +-- Crawl4AI
  +-- changedetection.io
  +-- Speaches/Kokoro
```

Acceptable gateway options:
- Caddy/Nginx reverse proxy on Hostinger with public DNS such as
  `research-gateway.alphogen.com`, TLS, and `Authorization: Bearer <service token>`.
- Cloudflare Tunnel / Zero Trust in front of the VPS.
- Tailscale/WireGuard only if the deployment environment can reliably reach the
  private network.

Implementation rule:
- Individual service containers stay private on the Docker network.
- Vercel never calls raw service ports directly.
- Public exposure is limited to a single gateway endpoint with authentication,
  rate limits, request size limits, and logs.
- Do not disable TLS verification in production. Use a public certificate or a
  trusted tunnel/proxy path.

The `*.alphoresearch.internal` hostnames below should be interpreted as VPS
internal Docker aliases, not URLs that Vercel can call directly. Future app env
vars should point to the gateway, not to these aliases.

---

## Service Definitions

### 1. SearXNG

**Purpose:** Private meta-search for source discovery  
**Role:** Aggregates results from multiple search engines without exposing API keys to the frontend.

#### Deployment

```
URL: https://search.alphoresearch.internal:9090
Service: Docker container (linuxserver/searxng or official image)
Port: 9090 (internal only, not public)
Network: VPS-internal bridge
Volumes: /var/lib/searxng (settings, instance, logs)
```

#### Environment Variables

```bash
# .env or docker-compose override
SEARXNG_INSTANCE_NAME=AlphoResearch
SEARXNG_SECRET=<32-char random hex>
SEARXNG_USE_HTTPS=true
SEARXNG_BASE_URL=https://search.alphoresearch.internal:9090
```

#### Auth / Access Control

- No authentication required **inside the private Docker network**.
- External callers must go through the Hostinger gateway with a service token.
- Do not expose port 9090 directly to the public internet.
- Rate limit: 60 req/min per search client (built-in SearXNG config).

#### API Contract

**POST /api/search**

Request:
```json
{
  "q": "Anthropic Claude release notes",
  "engines": ["google", "duckduckgo", "bing"],
  "pageno": 1,
  "format": "json"
}
```

Response:
```json
{
  "results": [
    {
      "title": "String",
      "url": "String (canonical)",
      "content": "String (snippet)",
      "engine": "String",
      "parsed_url": ["domain", "path"],
      "positions": [1, 2],
      "score": 1.0,
      "category": "social media|news|images|videos|..."
    }
  ],
  "answers": [],
  "corrections": [],
  "infoboxes": [],
  "suggestions": []
}
```

#### Health Check

**URL:** `https://search.alphoresearch.internal:9090/status`

Response:
```json
{
  "status": "ok",
  "version": "1.x.y",
  "searx_version": "..."
}
```

**Frequency:** Every 5 minutes (from Next.js app)  
**Timeout:** 10 seconds  
**On failure:** Log warning, fall back to next discovery retry, do NOT fail the research job.

#### Timeouts & Retries

| Operation | Timeout | Retries | Backoff |
| --- | --- | --- | --- |
| Search query | 30s | 2 | Exponential 2s → 5s |
| Connection | 5s | 3 | Linear 1s |

#### Quotas (V1)

- Max 100 searches per research job
- Max 20 candidate sources per search
- Max 10 searches per user per hour

#### Failure Behavior

- **Slow search (>30s):** Return partial results, log warning, allow user to proceed with fewer sources.
- **Service down:** Display banner "Source discovery temporarily unavailable", suggest manual URL entry.
- **Network block from Vercel IP:** Escalate to DevOps, allow manual source entry as fallback.

#### Logs & Monitoring

- Log to: `/var/lib/searxng/logs/access.log` and `searxng.log`
- Alerts: Uptime Kuma webhook on status != 200 for 2 consecutive checks.

---

### 2. Crawl4AI

**Purpose:** Extract readable Markdown content from candidate sources  
**Role:** Transforms HTML pages into structured Markdown, capturing metadata.

#### Deployment

```
URL: https://crawl.alphoresearch.internal:8000
Service: Docker container (crawl4ai, or Crawl4AI server image)
Port: 8000 (internal only)
Network: VPS-internal bridge
Volumes: /var/lib/crawl4ai (cache, logs, extracted content)
```

#### Environment Variables

```bash
CRAWL4AI_PORT=8000
CRAWL4AI_MAX_CONCURRENT_REQUESTS=5
CRAWL4AI_CACHE_DIR=/var/lib/crawl4ai/cache
CRAWL4AI_TIMEOUT_SECONDS=30
CRAWL4AI_USER_AGENT="AlphoResearch/1.0 (+https://alphogenai.com)"
```

#### Auth / Access Control

- No authentication required **inside the private Docker network**.
- External callers must go through the Hostinger gateway with a service token.
- Do not expose port 8000 directly to the public internet.
- Rate limit: 5 concurrent extractions, 60 req/min total.

#### API Contract

**POST /api/crawl**

Request:
```json
{
  "url": "https://example.com/article",
  "include_raw_html": false,
  "include_links": true,
  "extract_metadata": true,
  "timeout": 30,
  "js_enabled": false
}
```

Response (200 OK):
```json
{
  "success": true,
  "url": "https://example.com/article",
  "status_code": 200,
  "markdown": "# Article Title\n\n...",
  "metadata": {
    "title": "Article Title",
    "author": "Name",
    "published_date": "2026-06-10T00:00:00Z",
    "description": "Meta description",
    "og_image": "https://..."
  },
  "links": [
    { "url": "...", "text": "..." }
  ],
  "extraction_time_ms": 2500
}
```

Response (4xx/5xx):
```json
{
  "success": false,
  "url": "https://example.com/article",
  "error": "timeout|blocked|invalid_url|parse_error",
  "error_detail": "String"
}
```

#### Health Check

**URL:** `https://crawl.alphoresearch.internal:8000/health`

Response:
```json
{
  "status": "ok",
  "version": "0.x.y",
  "concurrent_jobs": 2,
  "cache_size_mb": 512
}
```

**Frequency:** Every 10 minutes  
**Timeout:** 10 seconds  
**On failure:** Log warning, skip extraction for new sources, allow user to re-trigger.

#### Timeouts & Retries

| Operation | Timeout | Retries | Backoff |
| --- | --- | --- | --- |
| Extract single URL | 30s | 2 | Exponential 2s → 5s |
| Batch extract (5 URLs) | 150s | 1 | Exponential 5s |
| Connection | 5s | 3 | Linear 1s |

#### Quotas (V1)

- Max 20 URLs per research job
- Max 50 KB per extracted source (truncate longer content)
- Max 10 MB total extraction per job
- Max 5 concurrent extractions per VPS

#### Failure Behavior

- **URL blocked (403/401):** Mark source as "extraction_blocked", do NOT retry, offer manual review.
- **Parse error:** Store partial markdown + error, allow researcher to edit/fix.
- **Timeout after 2 retries:** Mark source as "failed_timeout", log URL for DevOps review.
- **Service down:** Queue extractions, retry hourly, notify user of delay.

#### Content Truncation

If extracted Markdown exceeds 50 KB:
1. Keep title + first 40 KB of content.
2. Append `[... content truncated ...]` marker.
3. Store full URL in metadata for researcher to review manually.

#### Logs & Monitoring

- Log to: `/var/lib/crawl4ai/logs/extraction.log`
- Alert: Uptime Kuma on status != 200 for 3 consecutive health checks.

---

### 3. changedetection.io (Phase 4)

**Purpose:** Monitor watched sources for content changes, trigger research jobs  
**Role:** **Not V1** — included here for future reference and to prevent architectural surprises.

#### Deployment (Planned, Not Active)

```
URL: https://monitor.alphoresearch.internal:5000
Service: Docker container (changedetection.io)
Port: 5000 (internal only)
Network: VPS-internal bridge
Volumes: /var/lib/changedetection (datastore, watched sources, filters)
```

#### Webhook Contract (Future)

**Endpoint (on Vercel app):** `POST /api/webhooks/changedetection`

Request:
```json
{
  "uuid": "watch-uuid",
  "url": "https://example.com/product",
  "title": "Example Product",
  "change_type": "text_changed|added|removed",
  "diff": "... changed content snippet ...",
  "triggered_at": "2026-06-10T14:00:00Z"
}
```

**Action:** Create draft research job, do NOT auto-generate script or publish.

#### Auth / Rate Limits (Future)

- Secret token in Webhook URL: `?token=<32-char hex>`
- Rate limit: 100 webhooks per hour per user

---

### 4. Speaches / Kokoro (Phase 3+)

**Purpose:** Low-cost text-to-speech for voice-over experiments  
**Role:** **Not V1** — included for cost-aware architecture.

#### Deployment (Planned, Not Active)

```
URL: https://tts.alphoresearch.internal:8080
Service: Docker container (Kokoro or Speaches server)
Port: 8080 (internal only)
Network: VPS-internal bridge
Volumes: /var/lib/speaches (audio cache, logs)
```

#### API Contract (Future)

**POST /api/tts**

Request:
```json
{
  "text": "Script text",
  "lang": "en-US",
  "voice": "male|female",
  "speed": 1.0,
  "format": "mp3|wav"
}
```

#### Cost Model (Estimated V3)

- Kokoro (on-device): ~0.001 credits per 10 seconds
- Speaches (external): ~0.01 credits per 10 seconds

---

### 5. Redis / Dragonfly (Optional)

**Purpose:** Cache, rate limits, lightweight job queues  
**Role:** **Optional for V1** — only deploy if extraction or analysis latency warrants it.

#### Deployment (Optional)

```
URL: redis://localhost:6379 (or dragonfly://localhost:8379)
Service: Docker container (redis or dragonflydb)
Port: 6379 (internal only, no network binding)
Network: VPS-internal bridge
Volumes: /var/lib/redis (persistence)
```

#### Usage (When Enabled)

- Research job locks: `research:job:{id}:lock`
- SearXNG query cache: `search:{hash(query)}` → results (TTL: 24h)
- Extraction cache: `crawl:{hash(url)}` → markdown (TTL: 72h)
- Rate limit counters: `ratelimit:{user_id}:searches` (TTL: 1h)

#### Quotas

- Max 1 GB memory for V1

---

## Network & Security

### Firewall Rules

| Source | Destination | Port | Protocol | Rule |
| --- | --- | --- | --- | --- |
| Public internet | Hostinger gateway | 443 | HTTPS | Service token + rate limit |
| Gateway container | SearXNG | 9090 | Docker network | Private only |
| Gateway container | Crawl4AI | 8000 | Docker network | Private only |
| Gateway container | Redis | 6379 | Docker network | Private only, if enabled |
| VPS internal | All services | 9090, 8000, ... | TCP | Allow |
| World | Hostinger VPS | 22, 80, 443 | TCP | SSH + gateway only |

### Hostname Resolution

Internal DNS (via docker-compose or /etc/hosts on VPS only):

```
search.alphoresearch.internal    → 127.0.0.1
crawl.alphoresearch.internal     → 127.0.0.1
monitor.alphoresearch.internal   → 127.0.0.1 (future)
tts.alphoresearch.internal       → 127.0.0.1 (future)
redis.alphoresearch.internal     → 127.0.0.1 (if enabled)
```

### SSL/TLS

- Service containers use private Docker aliases.
- The public gateway uses a valid TLS certificate or a trusted tunnel.
- Vercel must not skip TLS verification in production.
- No raw service ports are publicly routable.

---

## Deployment & Operations

### Infrastructure Baseline

| Item | Requirement | Notes |
| --- | --- | --- |
| CPU | 2+ cores | For concurrent extraction and search |
| RAM | 4+ GB | SearXNG + Crawl4AI + optional Redis |
| Storage | 40+ GB | Logs, cache, extracted content |
| OS | Ubuntu 22.04 LTS | Standard Hostinger offering |
| Docker | 20.10+ | docker-compose for multi-service |

### Health Check Orchestration

**From Vercel Next.js app:**

```
Every 5 minutes:
  - SearXNG: GET /status
  - Crawl4AI: GET /health

Every 10 minutes:
  - changedetection: GET /health (if Phase 4 deployed)

On 2 consecutive failures:
  - Log to Supabase audit_log table
  - Ping Uptime Kuma webhook
  - Display warning banner in Research Studio UI
```

### Restart & Recovery

- Services configured with `restart: always` in docker-compose.
- On VPS reboot: services restart automatically.
- On persistent service failure: manual DevOps intervention required (no auto-remediation V1).

---

## Observability

### Logs

| Service | Log Path | Retention |
| --- | --- | --- |
| SearXNG | `/var/lib/searxng/logs/*.log` | 7 days |
| Crawl4AI | `/var/lib/crawl4ai/logs/*.log` | 7 days |
| changedetection | `/var/lib/changedetection/logs/*.log` | 30 days |
| Docker | `docker logs <container>` | Last 1000 lines |

### Metrics to Track

- Search latency (p50/p95/p99)
- Extraction success rate
- Average extraction time per URL
- Cache hit ratio (if Redis enabled)
- VPS disk usage (warn at 80%)
- VPS memory usage (warn at 85%)

### Uptime Kuma

Set up monitoring dashboard:
- SearXNG health endpoint
- Crawl4AI health endpoint
- VPS SSH connectivity
- Disk usage check

Webhook on alarm: Notify #devops Slack channel.

---

## Scope: Explicitly Out

- ❌ No production Supabase on Hostinger
- ❌ No production Next.js backend on Hostinger
- ❌ No GPU-accelerated video/image generation
- ❌ No n8n orchestration
- ❌ No automatic publishing or posting
- ❌ No public-facing APIs from Hostinger
- ❌ No media storage (all media stays in Vercel/Supabase/R2)

---

## Migration Checklist (When Ready for Phase 2)

- [ ] Hostinger VPS provisioned + baselines met
- [ ] Docker daemon installed and tested
- [ ] SearXNG container built and health-checked
- [ ] Crawl4AI container built and health-checked
- [ ] Internal DNS resolution working
- [ ] Firewall rules applied
- [ ] Vercel app updated with service URLs
- [ ] Uptime Kuma monitoring configured
- [ ] Logs forwarded to syslog or central logging
- [ ] Dev team trained on failure modes and recovery
- [ ] Load tests: 100 concurrent searches, 20 concurrent extractions
- [ ] Disaster recovery plan documented

---

## Future Enhancements (Beyond V1)

- LiteLLM gateway for token counting before expensive analysis
- Prometheus + Grafana for advanced metrics
- Automated failover to backup SearXNG instance
- Message queue (Bull, RabbitMQ) for large batch operations
- GPU worker node for Kokoro TTS (separate from main VPS)
- Database replication of research jobs to local cache for offline mode

---

## Version History

| Date | Status | Notes |
| --- | --- | --- |
| 2026-06-10 | Draft | Initial contract definition, Phase 2+ reference |

---

**Document Owner:** Infrastructure (Codex / Claude)  
**Last Reviewed:** 2026-06-10  
**Validation Status:** Awaiting approval before Phase 2 (T-1101+) begins
