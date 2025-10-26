#!/usr/bin/env python3
"""
Validation script to verify Runway removal and SVI migration
"""
import os
import sys
import subprocess
from pathlib import Path

def check_runway_references():
    """Check for any remaining Runway references in the codebase"""
    print("🔍 Checking for Runway references...")
    
    search_dirs = [
        "app",
        "components",
        "workers",
        "lib",
        "supabase"
    ]
    
    search_files = [
        "README.md",
        ".env.example",
        "AUDIO_AMBIENCE_README.md"
    ]
    
    runway_found = False
    
    for dir_name in search_dirs:
        if not os.path.exists(dir_name):
            continue
            
        result = subprocess.run(
            ["grep", "-r", "-i", "runway", dir_name, "--exclude-dir=node_modules", "--exclude-dir=.next"],
            capture_output=True,
            text=True
        )
        
        if result.stdout:
            print(f"  ❌ Found Runway references in {dir_name}:")
            print(result.stdout)
            runway_found = True
    
    for file_name in search_files:
        if not os.path.exists(file_name):
            continue
            
        result = subprocess.run(
            ["grep", "-i", "runway", file_name],
            capture_output=True,
            text=True
        )
        
        if result.stdout:
            print(f"  ❌ Found Runway references in {file_name}:")
            print(result.stdout)
            runway_found = True
    
    if not runway_found:
        print("  ✅ No Runway references found")
    
    return not runway_found

def check_required_env_vars():
    """Check that required environment variables are documented"""
    print("\n🔍 Checking required environment variables in .env.example...")
    
    required_vars = [
        "SVI_ENDPOINT_URL",
        "AUDIO_BACKEND_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "RUNPOD_API_KEY"
    ]
    
    if not os.path.exists(".env.example"):
        print("  ❌ .env.example not found")
        return False
    
    with open(".env.example", "r") as f:
        content = f.read()
    
    all_found = True
    for var in required_vars:
        if var in content:
            print(f"  ✅ {var} found")
        else:
            print(f"  ❌ {var} missing")
            all_found = False
    
    return all_found

def check_removed_files():
    """Check that Runway-specific files have been removed"""
    print("\n🔍 Checking that Runway files have been removed...")
    
    removed_files = [
        "workers/runway_service.py",
        "workers/runway_image_service.py",
        "workers/runway_orchestrator.py",
        "workers/test_runway.py",
        "WORKER_DEPLOYMENT.md",
        "app/admin/assets/page.tsx",
        "app/admin/manual-job/page.tsx",
        "app/api/admin/create-manual-job/route.ts",
        "app/api/admin/fix-manual-jobs/route.ts"
    ]
    
    all_removed = True
    for file_path in removed_files:
        if os.path.exists(file_path):
            print(f"  ❌ {file_path} still exists")
            all_removed = False
        else:
            print(f"  ✅ {file_path} removed")
    
    return all_removed

def check_new_files():
    """Check that new SVI files have been created"""
    print("\n🔍 Checking that new SVI files have been created...")
    
    new_files = [
        "workers/svi_client.py",
        "app/api/jobs/route.ts",
        "app/api/jobs/[id]/route.ts",
        "app/generate/page.tsx",
        "app/jobs/[id]/page.tsx"
    ]
    
    all_created = True
    for file_path in new_files:
        if os.path.exists(file_path):
            print(f"  ✅ {file_path} created")
        else:
            print(f"  ❌ {file_path} missing")
            all_created = False
    
    return all_created

def check_svi_client():
    """Check that svi_client.py has the required functions"""
    print("\n🔍 Checking svi_client.py implementation...")
    
    if not os.path.exists("workers/svi_client.py"):
        print("  ❌ workers/svi_client.py not found")
        return False
    
    with open("workers/svi_client.py", "r") as f:
        content = f.read()
    
    required_items = [
        "class SVIClient",
        "def generate_video",
        "def health_check",
        "def generate_svi_video"
    ]
    
    all_found = True
    for item in required_items:
        if item in content:
            print(f"  ✅ {item} found")
        else:
            print(f"  ❌ {item} missing")
            all_found = False
    
    return all_found

def main():
    """Run all validation checks"""
    print("="*60)
    print("🔍 AlphoGenAI - Runway Removal Validation")
    print("="*60)
    
    repo_root = Path(__file__).parent.parent
    os.chdir(repo_root)
    
    checks = [
        ("Runway references removed", check_runway_references),
        ("Required env vars documented", check_required_env_vars),
        ("Runway files removed", check_removed_files),
        ("New SVI files created", check_new_files),
        ("SVI client implemented", check_svi_client)
    ]
    
    results = []
    for check_name, check_func in checks:
        try:
            result = check_func()
            results.append((check_name, result))
        except Exception as e:
            print(f"\n❌ Error running check '{check_name}': {e}")
            results.append((check_name, False))
    
    print("\n" + "="*60)
    print("📊 Validation Summary")
    print("="*60)
    
    all_passed = True
    for check_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {check_name}")
        if not result:
            all_passed = False
    
    print("="*60)
    
    if all_passed:
        print("\n✅ All validation checks passed!")
        print("🎉 Runway removal and SVI migration complete!")
        return 0
    else:
        print("\n❌ Some validation checks failed")
        print("⚠️  Please review the errors above")
        return 1

if __name__ == "__main__":
    sys.exit(main())
