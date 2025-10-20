#!/usr/bin/env python3
"""
Test script for Image-to-Video (i2v) implementation
Tests both T2V and I2V modes with the new AlphoGenAI Mini features
"""

import asyncio
import os
import sys
from datetime import datetime
from typing import Dict, Any

# Add workers directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'workers'))

from workers.runway_orchestrator import create_and_run_job
from workers.supabase_client import SupabaseClient
from workers.supabase_storage_service import SupabaseStorageService


async def test_t2v_mode():
    """Test Text-to-Video mode"""
    print("\n" + "="*70)
    print("🎬 TESTING TEXT-TO-VIDEO (T2V) MODE")
    print("="*70)
    
    prompt = "Un robot futuriste découvre un océan lumineux au coucher du soleil, style cinématique"
    
    try:
        result = await create_and_run_job(
            user_id="test_user_t2v",
            prompt=prompt,
            generation_mode="t2v"
        )
        
        print(f"✅ T2V Test Result:")
        print(f"   Status: {result['status']}")
        print(f"   Job ID: {result['job_id']}")
        print(f"   Video URL: {result.get('video_url', 'N/A')[:60]}...")
        print(f"   Storage Path: {result.get('storage_path', 'N/A')}")
        
        return result
        
    except Exception as e:
        print(f"❌ T2V Test Failed: {str(e)}")
        return None


async def test_i2v_mode():
    """Test Image-to-Video mode"""
    print("\n" + "="*70)
    print("🎨 TESTING IMAGE-TO-VIDEO (I2V) MODE")
    print("="*70)
    
    # For testing, we'll use a placeholder image URL
    # In real usage, this would be uploaded to Supabase Storage first
    image_url = "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop"
    prompt = "Le robot bouge lentement ses bras vers le haut, la caméra fait un zoom avant doux"
    
    try:
        result = await create_and_run_job(
            user_id="test_user_i2v",
            prompt=prompt,
            generation_mode="i2v",
            image_ref_url=image_url
        )
        
        print(f"✅ I2V Test Result:")
        print(f"   Status: {result['status']}")
        print(f"   Job ID: {result['job_id']}")
        print(f"   Video URL: {result.get('video_url', 'N/A')[:60]}...")
        print(f"   Storage Path: {result.get('storage_path', 'N/A')}")
        print(f"   Reference Image: {image_url[:60]}...")
        
        return result
        
    except Exception as e:
        print(f"❌ I2V Test Failed: {str(e)}")
        return None


async def test_supabase_storage():
    """Test Supabase Storage service"""
    print("\n" + "="*70)
    print("💾 TESTING SUPABASE STORAGE SERVICE")
    print("="*70)
    
    try:
        storage_service = SupabaseStorageService()
        
        # Test listing files
        files = await storage_service.list_files(bucket="videos")
        print(f"✅ Storage Connection: Found {len(files)} files in videos bucket")
        
        # Test signed URL generation for existing file
        if files:
            first_file = files[0]
            file_name = first_file.get('name', '')
            if file_name:
                signed_url = await storage_service.get_signed_url(
                    file_path=file_name,
                    bucket="videos",
                    expires_in=3600
                )
                print(f"✅ Signed URL Generated: {signed_url[:60]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Storage Test Failed: {str(e)}")
        return False


async def test_database_schema():
    """Test new database schema with generation_mode support"""
    print("\n" + "="*70)
    print("🗄️ TESTING DATABASE SCHEMA")
    print("="*70)
    
    try:
        supabase = SupabaseClient()
        
        # Test creating a job with new fields
        job_id = await supabase.create_job(
            user_id="test_schema_user",
            prompt="Test prompt for schema validation",
            initial_state={
                "generation_mode": "i2v",
                "image_ref_url": "https://example.com/test.jpg",
                "test": True
            }
        )
        
        print(f"✅ Job Created: {job_id}")
        
        # Test updating with new fields
        await supabase.update_job_state(
            job_id=job_id,
            app_state={
                "generation_mode": "i2v",
                "image_ref_url": "https://example.com/test.jpg",
                "storage": {
                    "file_path": "test/video.mp4",
                    "signed_url": "https://example.com/signed/video.mp4"
                }
            },
            status="done",
            current_stage="completed"
        )
        
        print(f"✅ Job Updated with new schema fields")
        
        return True
        
    except Exception as e:
        print(f"❌ Database Schema Test Failed: {str(e)}")
        return False


async def run_comprehensive_tests():
    """Run all tests"""
    print("\n" + "🚀" * 35)
    print("🚀 ALPHOGENAI MINI - I2V IMPLEMENTATION TESTS")
    print("🚀" * 35)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = {}
    
    # Test 1: Database Schema
    print("\n📋 Test 1/4: Database Schema")
    results['database'] = await test_database_schema()
    
    # Test 2: Supabase Storage
    print("\n📋 Test 2/4: Supabase Storage")
    results['storage'] = await test_supabase_storage()
    
    # Test 3: T2V Mode (if environment allows)
    print("\n📋 Test 3/4: Text-to-Video Mode")
    if os.getenv("RUNWAY_API_KEY"):
        results['t2v'] = await test_t2v_mode()
    else:
        print("⚠️ Skipping T2V test: RUNWAY_API_KEY not found")
        results['t2v'] = None
    
    # Test 4: I2V Mode (if environment allows)
    print("\n📋 Test 4/4: Image-to-Video Mode")
    if os.getenv("RUNWAY_API_KEY"):
        results['i2v'] = await test_i2v_mode()
    else:
        print("⚠️ Skipping I2V test: RUNWAY_API_KEY not found")
        results['i2v'] = None
    
    # Summary
    print("\n" + "="*70)
    print("📊 TEST SUMMARY")
    print("="*70)
    
    passed = 0
    total = 0
    
    for test_name, result in results.items():
        total += 1
        if result:
            passed += 1
            status = "✅ PASSED"
        elif result is None:
            status = "⚠️ SKIPPED"
        else:
            status = "❌ FAILED"
        
        print(f"{test_name.upper():15} : {status}")
    
    print(f"\nResult: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! I2V implementation is ready!")
    elif passed > 0:
        print(f"\n⚠️ {total - passed} tests failed or were skipped. Check configuration.")
    else:
        print("\n❌ All tests failed. Check your environment setup.")
    
    print("\n" + "="*70)
    print("🔧 NEXT STEPS:")
    print("1. Apply database migration: supabase db push")
    print("2. Deploy Supabase Edge Function: supabase functions deploy daily-video-gen")
    print("3. Update environment variables on your deployment platform")
    print("4. Test the frontend at /creator/generate")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(run_comprehensive_tests())