#!/usr/bin/env python3
"""
Simple test to verify Runway URL configuration
"""
import os
import sys

def test_runway_url():
    """Test Runway URL configuration"""
    print("🔧 Testing Runway URL Configuration")
    print("=" * 50)
    
    # Test environment variable
    api_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1/tasks")
    api_key = os.getenv("RUNWAY_API_KEY")
    model = os.getenv("RUNWAY_MODEL", "gen4_turbo")
    
    print(f"RUNWAY_API_URL: {api_url}")
    print(f"RUNWAY_MODEL: {model}")
    print(f"RUNWAY_API_KEY: {'***' + api_key[-4:] if api_key else 'NOT SET'}")
    
    # Verify URL format
    expected_url = "https://api.dev.runwayml.com/v1/tasks"
    
    if api_url == expected_url:
        print(f"✅ URL is correct: {api_url}")
    else:
        print(f"❌ URL is incorrect!")
        print(f"   Current: {api_url}")
        print(f"   Expected: {expected_url}")
    
    # Check for problematic patterns
    if "/text_to_video" in api_url or "/image_to_video" in api_url:
        print(f"❌ URL contains old endpoint pattern!")
        print(f"   Remove /text_to_video or /image_to_video from the URL")
    
    print("\n🎯 Correct configuration:")
    print("RUNWAY_API_URL=https://api.dev.runwayml.com/v1/tasks")
    print("RUNWAY_MODEL=gen4_turbo")
    print("RUNWAY_API_KEY=your_api_key_here")

if __name__ == "__main__":
    test_runway_url()