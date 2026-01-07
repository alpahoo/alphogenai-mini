IMAGE ?= ghcr.io/alphogenai/holocine-service:latest
REGISTRY ?= ghcr.io

.PHONY: build run push smoke deploy fmt

build:
	docker build -t $(IMAGE) .

run:
	docker compose up --build

push:
	docker push $(IMAGE)

smoke:
	curl -fsS http://localhost:8000/healthz | jq .
	curl -fsS -X POST http://localhost:8000/generate \
	  -H 'Content-Type: application/json' \
	  -d '{"global_caption":"a cat sitting on a chair","num_frames":121,"mode":"sparse"}' | tee /tmp/job.json
	@JOB=$$(jq -r .job_id /tmp/job.json); \
	echo "Job: $$JOB"; \
	for i in $$(seq 1 120); do \
	  sleep 5; \
	  curl -fsS http://localhost:8000/status/$$JOB | tee /tmp/status.json; \
	  STATUS=$$(jq -r .status /tmp/status.json); \
	  if [ "$$STATUS" = "done" ]; then \
	    echo "Done"; \
	    jq -r .video_url /tmp/status.json; \
	    exit 0; \
	  elif [ "$$STATUS" = "error" ]; then \
	    echo "Error"; \
	    jq -r .error /tmp/status.json; \
	    exit 1; \
	  fi; \
	done; \
	echo "Timeout"; exit 1

# deploy target placeholder (requires RUNPOD_API_KEY and endpoint config)
deploy:
	@echo "Implement Runpod endpoint create/update via GitHub Actions or script"
