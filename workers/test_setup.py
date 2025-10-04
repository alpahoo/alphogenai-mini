"""
Test script to verify the setup is correct
"""
import asyncio
import sys
from typing import Dict, Any

from .config import get_settings, Settings
from .supabase_client import SupabaseClient


def test_env_vars():
    """Test that all required environment variables are set"""
    print("\n" + "="*60)
    print("Testing Environment Variables")
    print("="*60)
    
    try:
        settings = get_settings()
        
        required_vars = [
            ("SUPABASE_URL", settings.SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", settings.SUPABASE_SERVICE_KEY),
            ("QWEN_API_KEY", settings.QWEN_API_KEY),
            ("WAN_IMAGE_API_KEY", settings.WAN_IMAGE_API_KEY),
            ("PIKA_API_KEY", settings.PIKA_API_KEY),
            ("ELEVENLABS_API_KEY", settings.ELEVENLABS_API_KEY),
        ]
        
        all_set = True
        for name, value in required_vars:
            if not value or value.startswith("your-") or "xxxx" in value:
                print(f"❌ {name}: NOT SET or using placeholder")
                all_set = False
            else:
                # Show first 10 chars for security
                masked = value[:10] + "..." if len(value) > 10 else value
                print(f"✅ {name}: {masked}")
        
        print("\nOptional:")
        print(f"   WEBHOOK_URL: {settings.WEBHOOK_URL or 'Not set'}")
        print(f"   REMOTION_RENDERER_URL: {settings.REMOTION_RENDERER_URL}")
        
        if all_set:
            print("\n✅ All required environment variables are set!")
            return True
        else:
            print("\n❌ Some required environment variables are missing.")
            print("Please update .env.local with your API keys.")
            return False
            
    except Exception as e:
        print(f"❌ Error loading environment: {str(e)}")
        return False


async def test_supabase_connection():
    """Test Supabase connection and database tables"""
    print("\n" + "="*60)
    print("Testing Supabase Connection")
    print("="*60)
    
    try:
        supabase = SupabaseClient()
        
        # Test video_cache table exists
        result = supabase.client.table("video_cache").select("id").limit(1).execute()
        print("✅ video_cache table accessible")
        
        # Test video_artifacts table exists
        result = supabase.client.table("video_artifacts").select("id").limit(1).execute()
        print("✅ video_artifacts table accessible")
        
        print("\n✅ Supabase connection successful!")
        return True
        
    except Exception as e:
        print(f"❌ Supabase connection failed: {str(e)}")
        print("\nMake sure you've run the database migration:")
        print("  File: supabase/migrations/20251004_video_generation_tables.sql")
        return False


async def test_create_test_job():
    """Test creating a test job (won't actually process it)"""
    print("\n" + "="*60)
    print("Testing Job Creation")
    print("="*60)
    
    try:
        supabase = SupabaseClient()
        
        job_id = await supabase.create_job(
            user_id="test_user_id",
            prompt="Test prompt for setup verification",
            metadata={"test": True}
        )
        
        print(f"✅ Test job created: {job_id}")
        
        # Retrieve the job
        job = await supabase.get_job(job_id)
        print(f"✅ Test job retrieved: {job['status']}")
        
        # Clean up - delete the test job
        supabase.client.table("video_cache").delete().eq("id", job_id).execute()
        print("✅ Test job cleaned up")
        
        print("\n✅ Job creation and retrieval working!")
        return True
        
    except Exception as e:
        print(f"❌ Job creation failed: {str(e)}")
        return False


def print_summary(results: Dict[str, bool]):
    """Print test summary"""
    print("\n" + "="*60)
    print("Setup Test Summary")
    print("="*60)
    
    all_passed = all(results.values())
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*60)
    
    if all_passed:
        print("🎉 All tests passed! Your setup is ready.")
        print("\nNext steps:")
        print("1. Start the worker:")
        print("   python -m workers.worker")
        print("\n2. Create a video generation job via API:")
        print("   POST /api/generate-video")
        print("\n3. Or test directly with Python:")
        print("   python -m workers.langgraph_orchestrator 'Your prompt here'")
    else:
        print("⚠️  Some tests failed. Please fix the issues above.")
        print("\nCommon solutions:")
        print("- Update .env.local with valid API keys")
        print("- Run database migration in Supabase SQL editor")
        print("- Check Supabase service key has correct permissions")
    
    print("="*60 + "\n")
    
    return all_passed


async def main():
    """Run all setup tests"""
    print("\n🔧 AlphoGenAI Mini Setup Verification\n")
    
    results = {}
    
    # Test 1: Environment variables
    results["Environment Variables"] = test_env_vars()
    
    # Test 2: Supabase connection (only if env vars are set)
    if results["Environment Variables"]:
        results["Supabase Connection"] = await test_supabase_connection()
        
        # Test 3: Job creation (only if Supabase works)
        if results["Supabase Connection"]:
            results["Job Creation"] = await test_create_test_job()
    
    # Print summary
    all_passed = print_summary(results)
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
