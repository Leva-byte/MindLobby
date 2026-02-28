import os
import json
import requests
import logging
from dotenv import load_dotenv, find_dotenv
from markitdown import MarkItDown

# find_dotenv() searches parent directories too, so it always finds the .env
# override=True ensures it re-loads even if another module already called load_dotenv()
load_dotenv(find_dotenv(), override=True)

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "arcee-ai/trinity-large-preview:free"


def get_api_key():
    """Read the API key fresh every time so timing issues don't cause None."""
    key = os.getenv('OPENROUTER_API_KEY')
    if not key:
        raise ValueError(
            "OPENROUTER_API_KEY is missing. "
            "Make sure it is in your .env file and the file is in your project folder."
        )
    return key


# ============================================================================
# TEXT EXTRACTION VIA MARKITDOWN
# ============================================================================

def extract_text(file_path, filename):
    """
    Use MarkItDown to convert any supported file (PDF, DOCX, PPTX, TXT, etc.)
    into clean Markdown text, which is then fed to the AI.
    """
    ext = filename.rsplit('.', 1)[-1].lower()
    supported = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt'}

    if ext not in supported:
        raise ValueError(f"Unsupported file type: .{ext}")

    try:
        md = MarkItDown()
        result = md.convert(file_path)
        text = result.text_content.strip()
        logger.info(f"✅ MarkItDown extracted {len(text)} chars from '{filename}'")
    except Exception as e:
        logger.error(f"❌ MarkItDown error on '{filename}': {e}")
        raise ValueError(f"MarkItDown failed to parse '{filename}': {str(e)}")

    if not text:
        raise ValueError(
            "No readable text found in the file. "
            "It may be a scanned image, password-protected, or empty."
        )

    return text


# ============================================================================
# FLASHCARD GENERATION VIA OPENROUTER
# ============================================================================

def generate_flashcards(markdown_text):
    """
    Send MarkItDown-parsed Markdown to OpenRouter and get back flashcards.
    Returns a list: [{"question": "...", "answer": "..."}, ...]
    """
    api_key = get_api_key()  # read fresh every call — fixes the timing bug

    MAX_CHARS = 12000
    trimmed = markdown_text[:MAX_CHARS]

    prompt = f"""You are a study assistant. The following content has been extracted from a document and converted to Markdown format. Use the structure (headings, bullet points, tables) to understand the material and generate as many high-quality flashcards as the content warrants.

Rules:
- Each flashcard must have a clear, specific QUESTION and a concise ANSWER.
- Use headings and sections to identify the most important topics.
- Answers should be 1-3 sentences maximum.
- Generate more flashcards for longer or denser content, fewer for shorter content.
- Return ONLY valid JSON - no explanation, no markdown code fences, no extra text.

Format:
[
  {{"question": "...", "answer": "..."}},
  {{"question": "...", "answer": "..."}}
]

Document content (Markdown):
\"\"\"
{trimmed}
\"\"\"
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mindlobby.app",
        "X-Title": "MindLobby Flashcard Generator"
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4,
    }

    try:
        logger.info(f"📡 Sending request to OpenRouter (model: {OPENROUTER_MODEL})...")
        response = requests.post(
            OPENROUTER_BASE_URL, headers=headers, json=payload, timeout=60
        )
        logger.info(f"📥 OpenRouter status: {response.status_code}")

        if not response.ok:
            error_body = response.text
            logger.error(f"❌ OpenRouter error: {error_body}")
            raise ValueError(f"OpenRouter returned {response.status_code}: {error_body[:300]}")

    except requests.exceptions.Timeout:
        raise ValueError("OpenRouter API timed out after 60 seconds. Please try again.")
    except requests.exceptions.ConnectionError:
        raise ValueError("Could not connect to OpenRouter. Check your internet connection.")
    except ValueError:
        raise
    except requests.exceptions.RequestException as e:
        raise ValueError(f"OpenRouter request failed: {str(e)}")

    data = response.json()

    if 'error' in data:
        error_msg = data['error'].get('message', str(data['error']))
        logger.error(f"❌ OpenRouter API error: {error_msg}")
        raise ValueError(f"OpenRouter API error: {error_msg}")

    try:
        raw_content = data['choices'][0]['message']['content'].strip()
        logger.info(f"✅ Got AI response ({len(raw_content)} chars)")
    except (KeyError, IndexError):
        logger.error(f"❌ Unexpected response: {data}")
        raise ValueError("Unexpected response format from OpenRouter.")

    # Strip markdown code fences if the model wrapped the JSON in them
    if raw_content.startswith("```"):
        raw_content = raw_content.split("```")[1]
        if raw_content.startswith("json"):
            raw_content = raw_content[4:]
        raw_content = raw_content.strip()

    try:
        flashcards = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error(f"❌ Invalid JSON from AI:\n{raw_content}")
        raise ValueError("AI returned invalid JSON. Try again or use a different model.")

    if not isinstance(flashcards, list):
        raise ValueError("AI response was not a list of flashcards.")

    valid_cards = [
        card for card in flashcards
        if isinstance(card, dict) and 'question' in card and 'answer' in card
    ]

    if not valid_cards:
        raise ValueError("No valid flashcards were generated.")

    logger.info(f"✅ Generated {len(valid_cards)} flashcards")
    return valid_cards


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def process_file_to_flashcards(file_path, filename):
    """
    Full pipeline:
      1. MarkItDown converts the file to structured Markdown
      2. Markdown is sent to OpenRouter AI
      3. AI returns flashcards as JSON

    Returns (flashcards_list, markdown_text)
    """
    logger.info(f"🔄 Processing '{filename}'")
    markdown_text = extract_text(file_path, filename)
    flashcards = generate_flashcards(markdown_text)
    return flashcards, markdown_text