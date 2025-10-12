"""
Simple test for Runway Gen-4 integration
"""
import asyncio
import os
from runway_service import RunwayService


async def test_runway_generation():
    """Test basic Runway video generation"""
    
    if not os.getenv("RUNWAY_API_KEY"):
        print("❌ RUNWAY_API_KEY not set in environment")
        return False
    
    print("🧪 Testing Runway Gen-4 Turbo integration...\n")
    
    try:
        service = RunwayService()
        
        result = await service.generate_video(
            prompt="A serene beach at sunset, waves gently crashing",
            duration=10,
            aspect_ratio="16:9"
        )
        
        assert result.get("video_url"), "No video_url in result"
        assert result.get("task_id"), "No task_id in result"
        
        print(f"\n✅ Test passed!")
        print(f"Video URL: {result['video_url']}")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        return False


if __name__ == "__main__":
    asyncio.run(test_runway_generation())
