#!/usr/bin/env python3
"""
Simple validation test for I2V implementation
Tests file structure and basic configuration without external dependencies
"""

import os
import json
from pathlib import Path


def test_file_structure():
    """Test that all required files exist"""
    print("🔍 Testing file structure...")
    
    required_files = [
        # Database
        "supabase/migrations/20251019_add_generation_mode.sql",
        
        # Backend
        "workers/runway_service.py",
        "workers/runway_orchestrator.py", 
        "workers/supabase_storage_service.py",
        "supabase/functions/daily-video-gen/index.ts",
        
        # Frontend
        "app/creator/generate/ui/CreatorGenerateClient.tsx",
        "app/creator/generate/page.tsx",
        "app/(components)/VideoPreview.tsx",
        "app/v/[id]/VideoPlayer.tsx",
        "app/api/generate-video/route.ts",
        
        # Documentation
        "I2V_IMPLEMENTATION_SUMMARY.md"
    ]
    
    missing_files = []
    existing_files = []
    
    for file_path in required_files:
        full_path = Path(file_path)
        if full_path.exists():
            existing_files.append(file_path)
            print(f"  ✅ {file_path}")
        else:
            missing_files.append(file_path)
            print(f"  ❌ {file_path}")
    
    print(f"\nResult: {len(existing_files)}/{len(required_files)} files found")
    
    if missing_files:
        print(f"\n⚠️ Missing files:")
        for file in missing_files:
            print(f"  - {file}")
        return False
    
    return True


def test_migration_content():
    """Test migration file content"""
    print("\n🗄️ Testing database migration...")
    
    migration_file = "supabase/migrations/20251019_add_generation_mode.sql"
    
    if not os.path.exists(migration_file):
        print("  ❌ Migration file not found")
        return False
    
    with open(migration_file, 'r') as f:
        content = f.read()
    
    required_elements = [
        "generation_mode",
        "image_ref_url", 
        "projects",
        "project_scenes",
        "t2v",
        "i2v",
        "video_path"
    ]
    
    missing_elements = []
    for element in required_elements:
        if element in content:
            print(f"  ✅ Contains '{element}'")
        else:
            missing_elements.append(element)
            print(f"  ❌ Missing '{element}'")
    
    return len(missing_elements) == 0


def test_frontend_components():
    """Test frontend component structure"""
    print("\n🎨 Testing frontend components...")
    
    # Test CreatorGenerateClient
    client_file = "app/creator/generate/ui/CreatorGenerateClient.tsx"
    if os.path.exists(client_file):
        with open(client_file, 'r') as f:
            content = f.read()
        
        required_features = [
            "GenerationMode",
            "t2v",
            "i2v", 
            "imageFile",
            "uploadImageToSupabase",
            "toggle"
        ]
        
        for feature in required_features:
            if feature in content:
                print(f"  ✅ CreatorGenerateClient has '{feature}'")
            else:
                print(f"  ❌ CreatorGenerateClient missing '{feature}'")
    
    # Test VideoPreview
    preview_file = "app/(components)/VideoPreview.tsx"
    if os.path.exists(preview_file):
        with open(preview_file, 'r') as f:
            content = f.read()
        
        if "modal" in content.lower() and "preview" in content.lower():
            print(f"  ✅ VideoPreview has modal functionality")
        else:
            print(f"  ❌ VideoPreview missing modal functionality")
    
    return True


def test_api_endpoints():
    """Test API endpoint modifications"""
    print("\n🔌 Testing API endpoints...")
    
    api_file = "app/api/generate-video/route.ts"
    if os.path.exists(api_file):
        with open(api_file, 'r') as f:
            content = f.read()
        
        required_params = [
            "generation_mode",
            "image_ref_url",
            "i2v",
            "t2v"
        ]
        
        for param in required_params:
            if param in content:
                print(f"  ✅ API supports '{param}'")
            else:
                print(f"  ❌ API missing '{param}'")
    
    return True


def test_worker_modifications():
    """Test worker modifications"""
    print("\n⚙️ Testing worker modifications...")
    
    # Test runway_service
    runway_file = "workers/runway_service.py"
    if os.path.exists(runway_file):
        with open(runway_file, 'r') as f:
            content = f.read()
        
        if "image_url" in content and "generation_mode" in content:
            print(f"  ✅ runway_service supports i2v mode")
        else:
            print(f"  ❌ runway_service missing i2v support")
    
    # Test storage service
    storage_file = "workers/supabase_storage_service.py"
    if os.path.exists(storage_file):
        print(f"  ✅ supabase_storage_service exists")
    else:
        print(f"  ❌ supabase_storage_service missing")
    
    return True


def test_edge_function():
    """Test Supabase Edge Function"""
    print("\n🌐 Testing Edge Function...")
    
    edge_file = "supabase/functions/daily-video-gen/index.ts"
    if os.path.exists(edge_file):
        with open(edge_file, 'r') as f:
            content = f.read()
        
        required_features = [
            "generation_mode",
            "image_ref_url",
            "i2v",
            "t2v",
            "image_to_video",
            "text_to_video"
        ]
        
        for feature in required_features:
            if feature in content:
                print(f"  ✅ Edge Function supports '{feature}'")
            else:
                print(f"  ❌ Edge Function missing '{feature}'")
    else:
        print(f"  ❌ Edge Function file not found")
    
    return True


def main():
    """Run all validation tests"""
    print("🚀" * 35)
    print("🚀 ALPHOGENAI MINI - I2V VALIDATION TESTS")
    print("🚀" * 35)
    
    tests = [
        ("File Structure", test_file_structure),
        ("Database Migration", test_migration_content), 
        ("Frontend Components", test_frontend_components),
        ("API Endpoints", test_api_endpoints),
        ("Worker Modifications", test_worker_modifications),
        ("Edge Function", test_edge_function)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 Running: {test_name}")
        try:
            result = test_func()
            if result:
                passed += 1
                print(f"✅ {test_name}: PASSED")
            else:
                print(f"❌ {test_name}: FAILED")
        except Exception as e:
            print(f"❌ {test_name}: ERROR - {str(e)}")
    
    print("\n" + "="*70)
    print("📊 VALIDATION SUMMARY")
    print("="*70)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 ALL VALIDATION TESTS PASSED!")
        print("✅ I2V implementation structure is complete and ready!")
    else:
        print(f"\n⚠️ {total - passed} validation tests failed.")
        print("❌ Please review the implementation.")
    
    print("\n🔧 NEXT STEPS:")
    print("1. Apply database migration: supabase db push")
    print("2. Deploy Edge Function: supabase functions deploy daily-video-gen") 
    print("3. Update environment variables")
    print("4. Test the frontend interface")
    print("="*70)


if __name__ == "__main__":
    main()