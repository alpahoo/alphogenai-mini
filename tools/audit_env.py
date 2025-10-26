#!/usr/bin/env python3
"""
Audit Environment Variables for AlphoGenAI Audio Ambience Module

This script validates the presence and correctness of all required environment
variables for the SVI + Audio pipeline, and generates a comprehensive report.
"""

import os
import sys
from typing import Dict, List, Tuple
from datetime import datetime


class EnvironmentAuditor:
    """Audits environment variables for AlphoGenAI Audio Ambience setup."""
    
    def __init__(self):
        self.results: Dict[str, Dict] = {}
        self.missing: List[str] = []
        self.present: List[str] = []
        self.warnings: List[str] = []
        
    def check_var(self, var_name: str, required: bool = True, 
                  alternatives: List[str] = None) -> Tuple[bool, str]:
        """
        Check if an environment variable is set.
        
        Args:
            var_name: Primary variable name to check
            required: Whether this variable is required
            alternatives: Alternative variable names to check
            
        Returns:
            Tuple of (is_present, value_or_message)
        """
        value = os.getenv(var_name)
        
        if value:
            return True, "✓ Present"
        
        if alternatives:
            for alt in alternatives:
                alt_value = os.getenv(alt)
                if alt_value:
                    return True, f"✓ Present (via {alt})"
        
        if required:
            return False, "✗ MISSING (REQUIRED)"
        else:
            return False, "⚠ Missing (optional)"
    
    def audit_supabase(self):
        """Audit Supabase configuration."""
        print("🔍 Auditing Supabase configuration...")
        
        vars_to_check = [
            ("SUPABASE_URL", True, ["NEXT_PUBLIC_SUPABASE_URL"]),
            ("SUPABASE_SERVICE_ROLE", True, ["SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
            ("SUPABASE_BUCKET", False, None),
        ]
        
        self.results["Supabase"] = {}
        for var_name, required, alternatives in vars_to_check:
            is_present, status = self.check_var(var_name, required, alternatives)
            self.results["Supabase"][var_name] = status
            
            if is_present:
                self.present.append(var_name)
            elif required:
                self.missing.append(var_name)
    
    def audit_runpod_svi(self):
        """Audit Runpod and SVI configuration."""
        print("🔍 Auditing Runpod/SVI configuration...")
        
        vars_to_check = [
            ("RUNPOD_API_KEY", True, None),
            ("RUNPOD_ENDPOINT_ID", False, None),
            ("SVI_ENDPOINT_URL", False, None),
            ("SVI_MODE", False, None),
            ("SVI_FPS", False, None),
            ("SVI_RES", False, None),
            ("SVI_DURATION_SEC", False, None),
            ("SVI_SEED", False, None),
        ]
        
        self.results["Runpod/SVI"] = {}
        for var_name, required, alternatives in vars_to_check:
            is_present, status = self.check_var(var_name, required, alternatives)
            self.results["Runpod/SVI"][var_name] = status
            
            if is_present:
                self.present.append(var_name)
            elif required:
                self.missing.append(var_name)
        
        if not os.getenv("SVI_ENDPOINT_URL"):
            self.warnings.append("SVI_ENDPOINT_URL not set - SVI deployment required")
    
    def audit_audio_service(self):
        """Audit Audio Service configuration."""
        print("🔍 Auditing Audio Service configuration...")
        
        vars_to_check = [
            ("AUDIO_BACKEND_URL", False, None),
            ("AUDIO_MODE", False, None),
            ("AUDIO_PRIORITY", False, None),
            ("AUDIO_DIFFFOLEY", False, None),
            ("AUDIO_MOCK", False, None),
            ("CLAP_ENABLE", False, None),
        ]
        
        self.results["Audio Service"] = {}
        for var_name, required, alternatives in vars_to_check:
            is_present, status = self.check_var(var_name, required, alternatives)
            self.results["Audio Service"][var_name] = status
            
            if is_present:
                self.present.append(var_name)
            elif required:
                self.missing.append(var_name)
        
        if not os.getenv("AUDIO_BACKEND_URL"):
            self.warnings.append("AUDIO_BACKEND_URL not set - Audio service deployment required")
    
    def audit_storage(self):
        """Audit Storage configuration (R2 + Supabase)."""
        print("🔍 Auditing Storage configuration...")
        
        vars_to_check = [
            ("R2_ENDPOINT", False, None),
            ("R2_ACCESS_KEY_ID", False, None),
            ("R2_SECRET_ACCESS_KEY", False, None),
            ("R2_BUCKET", False, None),
        ]
        
        self.results["Storage (R2)"] = {}
        for var_name, required, alternatives in vars_to_check:
            is_present, status = self.check_var(var_name, required, alternatives)
            self.results["Storage (R2)"][var_name] = status
            
            if is_present:
                self.present.append(var_name)
        
        r2_vars = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
        r2_present = all(os.getenv(var) for var in r2_vars)
        
        if not r2_present:
            self.warnings.append("R2 not fully configured - will use Supabase Storage as fallback")
    
    def audit_budget_guards(self):
        """Audit Budget and Runtime Guards."""
        print("🔍 Auditing Budget Guards configuration...")
        
        vars_to_check = [
            ("MAX_CONCURRENCY", False, None),
            ("MAX_RUNTIME_PER_JOB", False, None),
            ("DAILY_BUDGET_ALERT_EUR", False, None),
            ("DAILY_BUDGET_HARDCAP_EUR", False, None),
        ]
        
        self.results["Budget Guards"] = {}
        for var_name, required, alternatives in vars_to_check:
            is_present, status = self.check_var(var_name, required, alternatives)
            self.results["Budget Guards"][var_name] = status
            
            if is_present:
                self.present.append(var_name)
    
    def generate_report(self) -> str:
        """Generate a comprehensive audit report in Markdown format."""
        report = []
        report.append("# AlphoGenAI Audio Ambience - Environment Audit Report")
        report.append(f"\n**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("\n---\n")
        
        report.append("## 📊 Summary\n")
        report.append(f"- **Variables Present:** {len(self.present)}")
        report.append(f"- **Variables Missing:** {len(self.missing)}")
        report.append(f"- **Warnings:** {len(self.warnings)}\n")
        
        report.append("## 🔍 Detailed Status\n")
        for category, vars_dict in self.results.items():
            report.append(f"### {category}\n")
            for var_name, status in vars_dict.items():
                report.append(f"- `{var_name}`: {status}")
            report.append("")
        
        if self.missing:
            report.append("## ❌ Missing Required Variables\n")
            for var in self.missing:
                report.append(f"- `{var}`")
            report.append("")
        
        if self.warnings:
            report.append("## ⚠️ Warnings\n")
            for warning in self.warnings:
                report.append(f"- {warning}")
            report.append("")
        
        report.append("## 🎯 Actions Required\n")
        
        if not os.getenv("SVI_ENDPOINT_URL"):
            report.append("### 1. Deploy SVI on Runpod\n")
            report.append("```bash")
            report.append("python tools/deploy_svi.py")
            report.append("```\n")
            report.append("This will:")
            report.append("- Build SVI Docker image with weights included")
            report.append("- Deploy to Runpod Serverless (A100 80GB)")
            report.append("- Expose endpoints: /healthz, /prompt_stream, /generate_film, /generate_shot")
            report.append("- Set SVI_ENDPOINT_URL in environment\n")
        
        if not os.getenv("AUDIO_BACKEND_URL"):
            report.append("### 2. Deploy Audio Service\n")
            report.append("```bash")
            report.append("cd services/audio-service")
            report.append("# Build and deploy (instructions in README.md)")
            report.append("```\n")
            report.append("This will:")
            report.append("- Deploy FastAPI service with AudioLDM2 + CLAP")
            report.append("- Expose endpoints: /audio/audioldm2, /audio/difffoley, /audio/clap/select")
            report.append("- Set AUDIO_BACKEND_URL in environment\n")
        
        if self.missing:
            report.append("### 3. Set Missing Required Variables\n")
            report.append("Add the following to your `.env` file:\n")
            report.append("```bash")
            for var in self.missing:
                report.append(f"{var}=your_value_here")
            report.append("```\n")
        
        report.append("## 📝 Recommended Default Values\n")
        report.append("```bash")
        report.append("# SVI Configuration")
        report.append("SVI_MODE=film")
        report.append("SVI_FPS=24")
        report.append("SVI_RES=1920x1080")
        report.append("SVI_DURATION_SEC=60")
        report.append("SVI_SEED=42")
        report.append("")
        report.append("# Audio Service Configuration")
        report.append("AUDIO_MODE=auto")
        report.append("AUDIO_PRIORITY=audioldm2")
        report.append("AUDIO_DIFFFOLEY=false")
        report.append("AUDIO_MOCK=false  # Set to true for development")
        report.append("CLAP_ENABLE=true")
        report.append("")
        report.append("# Budget Guards")
        report.append("MAX_CONCURRENCY=1")
        report.append("MAX_RUNTIME_PER_JOB=720  # 12 minutes")
        report.append("DAILY_BUDGET_ALERT_EUR=30")
        report.append("DAILY_BUDGET_HARDCAP_EUR=50")
        report.append("")
        report.append("# Storage")
        report.append("SUPABASE_BUCKET=generated")
        report.append("```\n")
        
        return "\n".join(report)
    
    def run_audit(self):
        """Run complete audit and generate report."""
        print("=" * 60)
        print("AlphoGenAI Audio Ambience - Environment Audit")
        print("=" * 60)
        print()
        
        self.audit_supabase()
        self.audit_runpod_svi()
        self.audit_audio_service()
        self.audit_storage()
        self.audit_budget_guards()
        
        print()
        print("=" * 60)
        print("Audit Complete!")
        print("=" * 60)
        print()
        
        print(f"✓ Variables Present: {len(self.present)}")
        print(f"✗ Variables Missing: {len(self.missing)}")
        print(f"⚠ Warnings: {len(self.warnings)}")
        print()
        
        if self.missing:
            print("❌ Missing required variables:")
            for var in self.missing:
                print(f"   - {var}")
            print()
        
        if self.warnings:
            print("⚠️  Warnings:")
            for warning in self.warnings:
                print(f"   - {warning}")
            print()
        
        report = self.generate_report()
        report_path = "tools/audit_report.md"
        
        with open(report_path, "w") as f:
            f.write(report)
        
        print(f"📄 Full report saved to: {report_path}")
        print()
        
        return 0 if not self.missing else 1


def main():
    """Main entry point."""
    auditor = EnvironmentAuditor()
    exit_code = auditor.run_audit()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
