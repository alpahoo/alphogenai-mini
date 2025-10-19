#!/usr/bin/env python3
"""
Test script to validate the correct Runway API structure
"""
import json

def test_runway_payloads():
    """Test the correct Runway API payload structures"""
    print("🎯 Testing Runway API Payload Structures")
    print("=" * 50)
    
    # Text-to-Video payload
    t2v_payload = {
        "type": "text_to_video",
        "model": "gen4_turbo",
        "input": {
            "promptText": "Un robot futuriste découvre un océan lumineux au coucher du soleil",
            "duration": 10,
            "ratio": "1280:720"
        }
    }
    
    # Image-to-Video payload
    i2v_payload = {
        "type": "image_to_video", 
        "model": "gen4_turbo",
        "input": {
            "image": {"url": "https://supabase.co/.../robot.jpg"},
            "promptText": "Le robot bouge lentement ses bras vers le haut",
            "duration": 10,
            "ratio": "1280:720"
        }
    }
    
    print("✅ Text-to-Video Payload:")
    print(json.dumps(t2v_payload, indent=2))
    
    print("\n✅ Image-to-Video Payload:")
    print(json.dumps(i2v_payload, indent=2))
    
    print("\n🔧 API Call Structure:")
    print("URL: POST https://api.dev.runwayml.com/v1/tasks")
    print("Headers:")
    print("  Authorization: Bearer <RUNWAY_API_KEY>")
    print("  Content-Type: application/json")
    print("  X-Runway-Version: 2024-11-06")
    
    print("\n🎯 Environment Variables:")
    print("RUNWAY_API_URL=https://api.dev.runwayml.com/v1")
    print("RUNWAY_MODEL=gen4_turbo")
    print("RUNWAY_API_KEY=your_api_key")
    
    print("\n✅ Key Changes:")
    print("- Single endpoint: /v1/tasks")
    print("- Type in payload: 'text_to_video' or 'image_to_video'")
    print("- Parameters in 'input' object")
    print("- No URL concatenation needed")

if __name__ == "__main__":
    test_runway_payloads()