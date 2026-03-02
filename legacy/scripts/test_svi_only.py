#!/usr/bin/env python3
"""
Simple test script for SVI-only video generation
Tests the SVI endpoint without audio generation
"""
import os
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from workers.svi_client import SVIClient, generate_svi_video
from workers.config import get_settings

async def test_svi_health():
    """Test SVI endpoint health check"""
    print("\n" + "="*60)
    print("🏥 Testing SVI Health Check")
    print("="*60)
    
    settings = get_settings()
    
    if not settings.SVI_ENDPOINT_URL:
        print("❌ SVI_ENDPOINT_URL not configured")
        return False
    
    print(f"SVI Endpoint: {settings.SVI_ENDPOINT_URL}")
    
    try:
        client = SVIClient()
        is_healthy = client.health_check()
        
        if is_healthy:
            print("✅ SVI endpoint is healthy")
            return True
        else:
            print("❌ SVI endpoint health check failed")
            return False
    except Exception as e:
        print(f"❌ Error checking SVI health: {e}")
        return False

async def test_svi_video_generation():
    """Test SVI video generation"""
    print("\n" + "="*60)
    print("🎬 Testing SVI Video Generation")
    print("="*60)
    
    settings = get_settings()
    
    if not settings.SVI_ENDPOINT_URL:
        print("❌ SVI_ENDPOINT_URL not configured")
        return False
    
    prompt = "A serene ocean sunset with gentle waves"
    print(f"Prompt: {prompt}")
    print(f"Duration: 10 seconds")
    print(f"Resolution: 1920x1080")
    print(f"FPS: 24")
    
    try:
        print("\n⏳ Generating video (this may take 1-2 minutes)...")
        
        result = generate_svi_video(
            prompt=prompt,
            duration_sec=10,
            resolution="1920x1080",
            fps=24,
            seed=42
        )
        
        if result.get("video_url"):
            print(f"\n✅ Video generated successfully!")
            print(f"Video URL: {result['video_url']}")
            return True
        else:
            print(f"\n❌ Video generation failed: {result}")
            return False
            
    except Exception as e:
        print(f"\n❌ Error generating video: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_svi_client_methods():
    """Test SVIClient methods"""
    print("\n" + "="*60)
    print("🔧 Testing SVIClient Methods")
    print("="*60)
    
    settings = get_settings()
    
    if not settings.SVI_ENDPOINT_URL:
        print("❌ SVI_ENDPOINT_URL not configured")
        return False
    
    try:
        client = SVIClient()
        
        print("\n1. Testing health_check()...")
        is_healthy = client.health_check()
        if is_healthy:
            print("   ✅ health_check() works")
        else:
            print("   ❌ health_check() failed")
            return False
        
        print("\n2. Testing generate_video()...")
        result = client.generate_video(
            prompt="A peaceful forest scene",
            duration_sec=10,
            resolution="1920x1080",
            fps=24,
            seed=42
        )
        
        if result.get("video_url"):
            print(f"   ✅ generate_video() works")
            print(f"   Video URL: {result['video_url']}")
        else:
            print(f"   ❌ generate_video() failed: {result}")
            return False
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error testing SVIClient: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all SVI tests"""
    print("="*60)
    print("🎬 AlphoGenAI - SVI-Only Test Suite")
    print("="*60)
    
    repo_root = Path(__file__).parent.parent
    os.chdir(repo_root)
    
    settings = get_settings()
    print(f"\nConfiguration:")
    print(f"  SVI_ENDPOINT_URL: {settings.SVI_ENDPOINT_URL or 'NOT SET'}")
    print(f"  AUDIO_BACKEND_URL: {settings.AUDIO_BACKEND_URL or 'NOT SET'}")
    print(f"  AUDIO_MODE: {settings.AUDIO_MODE}")
    
    if not settings.SVI_ENDPOINT_URL:
        print("\n❌ SVI_ENDPOINT_URL is not configured")
        print("⚠️  Please set SVI_ENDPOINT_URL in your .env file")
        return 1
    
    tests = [
        ("SVI Health Check", test_svi_health),
        ("SVI Video Generation", test_svi_video_generation),
        ("SVI Client Methods", test_svi_client_methods)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n❌ Error running test '{test_name}': {e}")
            results.append((test_name, False))
    
    print("\n" + "="*60)
    print("📊 Test Summary")
    print("="*60)
    
    all_passed = True
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not result:
            all_passed = False
    
    print("="*60)
    
    if all_passed:
        print("\n✅ All SVI tests passed!")
        print("🎉 SVI integration is working correctly!")
        return 0
    else:
        print("\n❌ Some SVI tests failed")
        print("⚠️  Please review the errors above")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
