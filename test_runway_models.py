#!/usr/bin/env python3
"""
Test different Runway model names to find available ones
"""

def test_model_variants():
    """Test different model name variants"""
    print("🎯 Testing Runway Model Variants")
    print("=" * 50)
    
    # Common model variants to try
    model_variants = [
        "gen3a_turbo",
        "gen3_turbo", 
        "gen4_turbo",
        "runway-gen3",
        "runway-gen3a",
        "runway-gen4",
        "gen3",
        "gen3a",
        "gen4"
    ]
    
    print("📋 Model variants to test:")
    for i, model in enumerate(model_variants, 1):
        print(f"  {i}. {model}")
    
    print("\n🔧 Test payload structure:")
    print("""
{
  "type": "text_to_video",
  "model": "<MODEL_NAME>",
  "input": {
    "promptText": "Test prompt",
    "duration": 5,
    "ratio": "1280:720"
  }
}
""")
    
    print("\n💡 Recommendations:")
    print("1. Start with 'gen3a_turbo' (most likely to work)")
    print("2. Try 'gen3' or 'gen3a' as simpler variants")
    print("3. Check Runway docs for exact model names")
    print("4. Test with shorter duration (5s instead of 10s)")
    
    print("\n🔗 Useful links:")
    print("- Runway API Docs: https://docs.dev.runwayml.com/api")
    print("- Models endpoint: GET /v1/models (if available)")

if __name__ == "__main__":
    test_model_variants()