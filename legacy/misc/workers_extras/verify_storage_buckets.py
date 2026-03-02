"""
Verification script to check Supabase Storage bucket configuration
"""
import os
from supabase import create_client

def verify_buckets():
    """Verify that storage buckets exist and are configured correctly"""
    
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE environment variables required")
        return False
    
    print("=" * 70)
    print("SUPABASE STORAGE BUCKET VERIFICATION")
    print("=" * 70)
    print()
    
    print(f"Connecting to Supabase: {supabase_url}")
    supabase = create_client(supabase_url, supabase_key)
    
    try:
        print("\n[1] Listing all buckets...")
        result = supabase.storage.list_buckets()
        
        if not result:
            print("❌ No buckets found in Supabase Storage!")
            print("   The migration was NOT applied.")
            return False
        
        print(f"✓ Found {len(result)} bucket(s):")
        for bucket in result:
            print(f"   - {bucket.name} (id: {bucket.id}, public: {bucket.public})")
        
        print("\n[2] Checking for required buckets...")
        bucket_names = [b.name for b in result]
        
        videos_exists = 'videos' in bucket_names
        assets_exists = 'assets' in bucket_names
        
        if videos_exists:
            print("✓ 'videos' bucket exists")
        else:
            print("❌ 'videos' bucket NOT FOUND")
        
        if assets_exists:
            print("✓ 'assets' bucket exists")
        else:
            print("❌ 'assets' bucket NOT FOUND")
        
        print("\n[3] Checking bucket configuration...")
        for bucket in result:
            if bucket.name in ['videos', 'assets']:
                print(f"\n   Bucket: {bucket.name}")
                print(f"   - ID: {bucket.id}")
                print(f"   - Public: {bucket.public}")
                print(f"   - File size limit: {getattr(bucket, 'file_size_limit', 'N/A')}")
                print(f"   - Allowed MIME types: {getattr(bucket, 'allowed_mime_types', 'N/A')}")
        
        print("\n[4] Testing bucket access...")
        try:
            if videos_exists:
                files = supabase.storage.from_('videos').list()
                print(f"✓ 'videos' bucket accessible ({len(files)} files)")
            
            if assets_exists:
                files = supabase.storage.from_('assets').list()
                print(f"✓ 'assets' bucket accessible ({len(files)} files)")
        except Exception as e:
            print(f"⚠️  Bucket access test failed: {str(e)}")
        
        print("\n" + "=" * 70)
        if videos_exists and assets_exists:
            print("✅ RESULT: Both buckets exist and are configured")
            print("   The issue may be elsewhere (permissions, file paths, etc.)")
            return True
        else:
            print("❌ RESULT: Required buckets are MISSING")
            print("   The SQL migration was NOT applied to Supabase")
            return False
        
    except Exception as e:
        print(f"\n❌ Error during verification: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    verify_buckets()
