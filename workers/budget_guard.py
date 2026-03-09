#!/usr/bin/env python3
"""
Budget Guard System

Implements budget controls for Runpod GPU usage:
- MAX_CONCURRENCY: Limit concurrent jobs
- MAX_RUNTIME_PER_JOB: Timeout per job
- DAILY_BUDGET_ALERT_EUR: Alert threshold
- DAILY_BUDGET_HARDCAP_EUR: Hard spending limit

Author: AlphoGenAI Team
"""

import os
import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class BudgetConfig:
    """Budget configuration parameters."""
    max_concurrency: int = 1
    max_runtime_per_job: int = 720  # 12 minutes in seconds
    daily_budget_alert_eur: float = 30.0
    daily_budget_hardcap_eur: float = 50.0
    
    svi_cost_per_hour: float = 1.89  # A100 80GB
    audio_cost_per_hour: float = 0.69  # RTX 4090
    
    @classmethod
    def from_env(cls) -> "BudgetConfig":
        """Load configuration from environment variables."""
        return cls(
            max_concurrency=int(os.getenv("MAX_CONCURRENCY", "1")),
            max_runtime_per_job=int(os.getenv("MAX_RUNTIME_PER_JOB", "720")),
            daily_budget_alert_eur=float(os.getenv("DAILY_BUDGET_ALERT_EUR", "30.0")),
            daily_budget_hardcap_eur=float(os.getenv("DAILY_BUDGET_HARDCAP_EUR", "50.0")),
        )


class BudgetGuard:
    """
    Budget guard system for controlling GPU spending.
    
    Features:
    - Concurrency limiting
    - Job timeout enforcement
    - Daily spending tracking
    - Alert and hard cap enforcement
    """
    
    def __init__(self, config: Optional[BudgetConfig] = None):
        """Initialize budget guard."""
        self.config = config or BudgetConfig.from_env()
        self.active_jobs: Dict[str, datetime] = {}
        self.daily_spending: Dict[str, float] = {}  # date -> EUR
        self.alert_sent_today = False
        
        logger.info(f"Budget Guard initialized: "
                   f"MAX_CONCURRENCY={self.config.max_concurrency}, "
                   f"MAX_RUNTIME={self.config.max_runtime_per_job}s, "
                   f"ALERT={self.config.daily_budget_alert_eur}€, "
                   f"CAP={self.config.daily_budget_hardcap_eur}€")
    
    def can_start_job(self) -> tuple[bool, Optional[str]]:
        """
        Check if a new job can be started.
        
        Returns:
            (can_start, reason) - True if job can start, False with reason otherwise
        """
        if len(self.active_jobs) >= self.config.max_concurrency:
            return False, f"Concurrency limit reached ({self.config.max_concurrency} jobs active)"
        
        today = datetime.now(timezone.utc).date().isoformat()
        daily_spent = self.daily_spending.get(today, 0.0)
        
        if daily_spent >= self.config.daily_budget_hardcap_eur:
            return False, f"Daily budget hard cap reached ({daily_spent:.2f}€ / {self.config.daily_budget_hardcap_eur}€)"
        
        estimated_job_cost = self._estimate_job_cost()
        if daily_spent + estimated_job_cost > self.config.daily_budget_hardcap_eur:
            return False, f"Starting job would exceed daily budget cap ({daily_spent:.2f}€ + {estimated_job_cost:.2f}€ > {self.config.daily_budget_hardcap_eur}€)"
        
        return True, None
    
    def start_job(self, job_id: str) -> None:
        """
        Register a job as started.
        
        Args:
            job_id: Job ID to track
        """
        self.active_jobs[job_id] = datetime.now(timezone.utc)
        logger.info(f"Job {job_id} started (active: {len(self.active_jobs)}/{self.config.max_concurrency})")
    
    def finish_job(self, job_id: str, duration_seconds: Optional[float] = None) -> float:
        """
        Register a job as finished and update spending.
        
        Args:
            job_id: Job ID
            duration_seconds: Actual duration (if None, calculated from start time)
            
        Returns:
            Estimated cost in EUR
        """
        if job_id not in self.active_jobs:
            logger.warning(f"Job {job_id} not found in active jobs")
            return 0.0
        
        if duration_seconds is None:
            start_time = self.active_jobs[job_id]
            duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        del self.active_jobs[job_id]
        
        cost = self._calculate_cost(duration_seconds)
        
        today = datetime.now(timezone.utc).date().isoformat()
        self.daily_spending[today] = self.daily_spending.get(today, 0.0) + cost
        
        logger.info(f"Job {job_id} finished: duration={duration_seconds:.1f}s, cost={cost:.4f}€, "
                   f"daily_total={self.daily_spending[today]:.2f}€")
        
        self._check_alert_threshold()
        
        return cost
    
    def check_job_timeout(self, job_id: str) -> bool:
        """
        Check if a job has exceeded the maximum runtime.
        
        Args:
            job_id: Job ID to check
            
        Returns:
            True if job has timed out
        """
        if job_id not in self.active_jobs:
            return False
        
        start_time = self.active_jobs[job_id]
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        if elapsed > self.config.max_runtime_per_job:
            logger.warning(f"Job {job_id} timed out: {elapsed:.1f}s > {self.config.max_runtime_per_job}s")
            return True
        
        return False
    
    def get_active_jobs(self) -> Dict[str, float]:
        """
        Get active jobs with their elapsed times.
        
        Returns:
            Dictionary mapping job_id to elapsed seconds
        """
        now = datetime.now(timezone.utc)
        return {
            job_id: (now - start_time).total_seconds()
            for job_id, start_time in self.active_jobs.items()
        }
    
    def get_daily_spending(self) -> Dict[str, Any]:
        """
        Get daily spending summary.
        
        Returns:
            Dictionary with spending statistics
        """
        today = datetime.now(timezone.utc).date().isoformat()
        daily_spent = self.daily_spending.get(today, 0.0)
        
        return {
            "date": today,
            "spent_eur": daily_spent,
            "alert_threshold_eur": self.config.daily_budget_alert_eur,
            "hard_cap_eur": self.config.daily_budget_hardcap_eur,
            "remaining_eur": max(0, self.config.daily_budget_hardcap_eur - daily_spent),
            "percentage_used": (daily_spent / self.config.daily_budget_hardcap_eur) * 100,
            "alert_triggered": daily_spent >= self.config.daily_budget_alert_eur,
            "cap_reached": daily_spent >= self.config.daily_budget_hardcap_eur
        }
    
    def reset_daily_spending(self) -> None:
        """Reset daily spending (called at midnight UTC)."""
        today = datetime.now(timezone.utc).date().isoformat()
        if today in self.daily_spending:
            logger.info(f"Resetting daily spending: {self.daily_spending[today]:.2f}€")
            del self.daily_spending[today]
        self.alert_sent_today = False
    
    def _estimate_job_cost(self) -> float:
        """
        Estimate cost of a typical job.
        
        Returns:
            Estimated cost in EUR
        """
        avg_duration_hours = 5.0 / 60.0
        
        svi_cost = self.config.svi_cost_per_hour * avg_duration_hours
        audio_cost = self.config.audio_cost_per_hour * avg_duration_hours
        
        return svi_cost + audio_cost
    
    def _calculate_cost(self, duration_seconds: float) -> float:
        """
        Calculate actual cost based on duration.
        
        Args:
            duration_seconds: Job duration in seconds
            
        Returns:
            Cost in EUR
        """
        duration_hours = duration_seconds / 3600.0
        
        svi_cost = self.config.svi_cost_per_hour * duration_hours
        audio_cost = self.config.audio_cost_per_hour * duration_hours
        
        return svi_cost + audio_cost
    
    def _check_alert_threshold(self) -> None:
        """Check if alert threshold has been reached and log warning."""
        today = datetime.now(timezone.utc).date().isoformat()
        daily_spent = self.daily_spending.get(today, 0.0)
        
        if daily_spent >= self.config.daily_budget_alert_eur and not self.alert_sent_today:
            logger.warning(
                f"⚠️  BUDGET ALERT: Daily spending reached {daily_spent:.2f}€ "
                f"(threshold: {self.config.daily_budget_alert_eur}€)"
            )
            self.alert_sent_today = True
            


class BudgetGuardMiddleware:
    """
    Middleware for integrating budget guard into worker.
    
    Usage:
        guard = BudgetGuard()
        middleware = BudgetGuardMiddleware(guard)
        
        if not await middleware.before_job(job_id):
            return
        
        
        await middleware.after_job(job_id, success=True)
    """
    
    def __init__(self, guard: BudgetGuard):
        """Initialize middleware."""
        self.guard = guard
        self._reset_task = None
        self._start_daily_reset()
    
    async def before_job(self, job_id: str) -> bool:
        """
        Check if job can start and register it.
        
        Args:
            job_id: Job ID
            
        Returns:
            True if job can proceed, False otherwise
        """
        can_start, reason = self.guard.can_start_job()
        
        if not can_start:
            logger.warning(f"Job {job_id} blocked by budget guard: {reason}")
            return False
        
        self.guard.start_job(job_id)
        return True
    
    async def after_job(self, job_id: str, success: bool = True) -> None:
        """
        Register job completion and update spending.
        
        Args:
            job_id: Job ID
            success: Whether job completed successfully
        """
        cost = self.guard.finish_job(job_id)
        
        if success:
            logger.info(f"Job {job_id} completed successfully (cost: {cost:.4f}€)")
        else:
            logger.warning(f"Job {job_id} failed (cost: {cost:.4f}€)")
    
    async def check_timeout(self, job_id: str) -> bool:
        """
        Check if job has timed out.
        
        Args:
            job_id: Job ID
            
        Returns:
            True if job should be terminated
        """
        return self.guard.check_job_timeout(job_id)
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get budget guard status.
        
        Returns:
            Status dictionary
        """
        active_jobs = self.guard.get_active_jobs()
        spending = self.guard.get_daily_spending()
        
        return {
            "active_jobs": len(active_jobs),
            "max_concurrency": self.guard.config.max_concurrency,
            "jobs": active_jobs,
            "spending": spending,
            "config": {
                "max_runtime_per_job": self.guard.config.max_runtime_per_job,
                "daily_budget_alert_eur": self.guard.config.daily_budget_alert_eur,
                "daily_budget_hardcap_eur": self.guard.config.daily_budget_hardcap_eur
            }
        }
    
    def _start_daily_reset(self) -> None:
        """Start background task for daily spending reset."""
        async def reset_loop():
            while True:
                now = datetime.now(timezone.utc)
                tomorrow = now.date() + timedelta(days=1)
                midnight = datetime.combine(tomorrow, datetime.min.time(), tzinfo=timezone.utc)
                seconds_until_midnight = (midnight - now).total_seconds()

                await asyncio.sleep(seconds_until_midnight)

                self.guard.reset_daily_spending()

        try:
            self._reset_task = asyncio.create_task(reset_loop())
        except RuntimeError:
            # No running event loop yet — will be started later
            self._reset_task = None


async def example_usage():
    """Example showing how to use budget guard in worker."""
    from .supabase_client import SupabaseClient
    
    guard = BudgetGuard()
    middleware = BudgetGuardMiddleware(guard)
    supabase = SupabaseClient()
    
    job_id = "example-job-123"
    
    try:
        if not await middleware.before_job(job_id):
            await supabase.update_job_state(
                job_id,
                status="failed",
                error_message="Budget limit reached - job blocked by budget guard"
            )
            return
        
        logger.info(f"Processing job {job_id}...")
        await asyncio.sleep(5)  # Simulate work
        
        if await middleware.check_timeout(job_id):
            await supabase.update_job_state(
                job_id,
                status="failed",
                error_message=f"Job timeout - exceeded {guard.config.max_runtime_per_job}s"
            )
            await middleware.after_job(job_id, success=False)
            return
        
        await middleware.after_job(job_id, success=True)
        
        status = middleware.get_status()
        logger.info(f"Budget status: {status}")
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        await middleware.after_job(job_id, success=False)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    asyncio.run(example_usage())
