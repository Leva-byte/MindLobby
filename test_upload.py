#!/usr/bin/env python3
"""
MindLobby Flashcard Upload Diagnostics
Run this to test if the flashcard generation pipeline works independently
"""

import os
import sys
from dotenv import load_dotenv

print("=" * 80)
print("MINDLOBBY FLASHCARD UPLOAD DIAGNOSTICS")
print("=" * 80)
print()

# Load environment variables
print("📋 Step 1: Loading environment variables...")
load_dotenv()

# Check required environment variables
print("📋 Step 2: Checking environment variables...")
required_vars = ['OPENROUTER_API_KEY', 'SECRET_KEY']
missing = []

for var in required_vars:
    value = os.getenv(var)
    if not value:
        missing.append(var)
        print(f"  ❌ {var}: NOT SET")
    else:
        masked = value[:8] + "..." + value[-4:] if len(value) > 12 else "***"
        print(f"  ✅ {var}: {masked}")

if missing:
    print()
    print(f"❌ ERROR: Missing required environment variables: {', '.join(missing)}")
    print("   Please add them to your .env file")
    sys.exit(1)

print()
print("📋 Step 3: Testing module imports...")

try:
    from flashcard_service import process_file_to_flashcards
    print("  ✅ flashcard_service imported")
except ImportError as e:
    print(f"  ❌ Failed to import flashcard_service: {e}")
    sys.exit(1)

try:
    from markitdown import MarkItDown
    print("  ✅ markitdown imported")
except ImportError:
    print("  ❌ markitdown not installed")
    print("     Run: pip install markitdown[all]")
    sys.exit(1)

try:
    import requests
    print("  ✅ requests imported")
except ImportError:
    print("  ❌ requests not installed")
    print("     Run: pip install requests")
    sys.exit(1)

print()
print("📋 Step 4: Checking for test file...")

# Look for a test PDF in the project root
test_files = [f for f in os.listdir('.') if f.endswith(('.pdf', '.docx', '.txt'))]

if not test_files:
    print("  ⚠️  No test files found")
    print("     Place a .pdf, .docx, or .txt file in the project root to test")
    print()
    print("✅ Environment check complete - no issues found")
    print("   The upload should work once you provide a test file")
    sys.exit(0)

test_file = test_files[0]
print(f"  ✅ Found test file: {test_file}")

print()
print("📋 Step 5: Testing flashcard generation...")
print(f"  Processing: {test_file}")
print("  This may take 30-60 seconds...")
print()

try:
    flashcards, markdown = process_file_to_flashcards(test_file, test_file, num_cards=5)
    
    print(f"✅ SUCCESS! Generated {len(flashcards)} flashcards")
    print()
    print("Sample flashcards:")
    for i, card in enumerate(flashcards[:3], 1):
        print(f"\n  Card {i}:")
        print(f"  Q: {card['question']}")
        print(f"  A: {card['answer']}")
    
    print()
    print("=" * 80)
    print("✅ ALL TESTS PASSED - Upload should work fine!")
    print("=" * 80)

except Exception as e:
    print(f"❌ ERROR during flashcard generation:")
    print(f"   {str(e)}")
    print()
    print("Common issues:")
    print("  1. OpenRouter API key invalid - check your .env file")
    print("  2. File is password-protected or corrupted")
    print("  3. File contains no readable text (scanned PDF)")
    print("  4. Network/firewall blocking OpenRouter API")
    import traceback
    print()
    print("Full error trace:")
    traceback.print_exc()
    sys.exit(1)