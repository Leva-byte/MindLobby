import os
import re
import json
import random
import requests
import logging
from concurrent.futures import ThreadPoolExecutor
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
    supported = {'pdf', 'doc', 'docx', 'pptx', 'txt'}

    if ext == 'ppt':
        raise ValueError(
            "Legacy .ppt files are not supported. "
            "Please save as .pptx (PowerPoint 2007+) and re-upload."
        )

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
            "No readable text found. This file may contain only images, "
            "be scanned/password-protected, or be empty. "
            "Text-based documents are required for processing."
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
- CRITICAL: Keep answers SHORT — ideally 1 to 8 words. These will be used as multiple-choice quiz options, so long paragraph answers do not work. If a concept needs explanation, put the explanation in the question and make the answer the key term or short phrase.
- Generate more flashcards for longer or denser content, fewer for shorter content.
- IMPORTANT: The question must NOT contain or repeat the key words from the answer. If the question includes the answer text, it becomes a giveaway in a quiz.
- Do NOT start the question with the answer word or phrase.
- Prefer questions that test understanding (e.g. "Which of the following describes...", "What term refers to...") rather than simple definition recall.

BAD examples (do NOT do this):
  Q: "What is visual art?" A: "Visual art is a form of artistic expression that is primarily visual in nature" (answer too long, question contains answer)
  Q: "Photosynthesis converts what?" A: "Photosynthesis converts sunlight into chemical energy" (answer repeats question, answer too long)

GOOD examples (do this):
  Q: "Which field of art primarily involves creating works that are visual in nature?" A: "Visual art"
  Q: "What process do plants use to convert sunlight into chemical energy?" A: "Photosynthesis"
  Q: "Which data structure uses FIFO (First In, First Out) ordering?" A: "Queue"

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
            OPENROUTER_BASE_URL, headers=headers, json=payload, timeout=120
        )
        logger.info(f"📥 OpenRouter status: {response.status_code}")

        if not response.ok:
            error_body = response.text
            logger.error(f"❌ OpenRouter error: {error_body}")
            raise ValueError(f"OpenRouter returned {response.status_code}: {error_body[:300]}")

    except requests.exceptions.Timeout:
        raise ValueError("OpenRouter API timed out after 120 seconds. Please try again.")
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
        # Attempt to repair common AI malformat: "question": "..." A: "..."
        # Should be: "question": "...", "answer": "..."
        repaired = re.sub(r'"\s*A:\s*"', '", "answer": "', raw_content)
        try:
            flashcards = json.loads(repaired)
            logger.info("⚡ Repaired malformed AI JSON (missing 'answer' keys)")
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
# NOTES GENERATION VIA OPENROUTER
# ============================================================================

def generate_notes(markdown_text, source_type='document'):
    """
    Send MarkItDown-parsed Markdown to OpenRouter and get back a clean,
    structured lecture summary in Markdown format.

    Falls back to raw markdown_text if the AI call fails for any reason,
    so the upload pipeline never breaks due to notes generation.

    source_type: 'document' (default) or 'youtube' — YouTube transcripts
    get a tighter summarization prompt and a lower character cap to avoid
    timeouts on the free-tier model.

    Returns a markdown string.
    """
    api_key = get_api_key()

    MAX_CHARS = 8000 if source_type == 'youtube' else 12000
    trimmed = markdown_text[:MAX_CHARS]

    if source_type == 'youtube':
        prompt = f"""You are an expert academic note-taker. The following is a YouTube video transcript — it is raw, unformatted spoken text with no structure. Your job is to transform it into thorough, well-structured study notes in Markdown format.

Rules:
- COMPLETENESS IS THE TOP PRIORITY. Capture every distinct concept, example, term, and item mentioned in the transcript. Do NOT skip or omit any substantive content — if the speaker lists 8 items, all 8 must appear in the notes.
- Use ## headings for major topics and ### for subtopics discussed in the video.
- Under each heading, write a clear summary in your own words, followed by bullet points covering ALL key details from that section.
- Include every name, term, example, statistic, and list item the speaker mentions — missing even one is unacceptable.
- Skip ONLY filler words, repetitions, off-topic tangents, sponsor mentions, and greetings.
- Write in a clear, educational tone as if explaining to a student reading these notes before an exam.
- Return ONLY the Markdown content — no preamble, no closing remarks, no code fences, no extra commentary.

YouTube transcript:
\"\"\"
{trimmed}
\"\"\"
"""
    else:
        prompt = f"""You are an expert academic note-taker. The following content was extracted from a study document using an automated tool — it may contain garbled characters, symbols, broken lines, or formatting artifacts. Your job is to rewrite it as clean, well-structured lecture notes in Markdown format that a student can read and understand easily.

Rules:
- Use ## headings for major topics and ### for subtopics.
- Under each heading, write 2-4 sentences of clear prose summarizing that section. Do NOT copy the original text verbatim — rewrite it in your own words.
- Follow each prose summary with a short bullet list of the most important key points, terms, or facts from that section.
- Completely ignore garbled text, question marks, broken symbols, page numbers, slide numbers, or any content that is clearly a formatting artifact.
- Do not include a table of contents.
- Write in a clear, educational tone as if explaining to a student reading these notes before an exam.
- Return ONLY the Markdown content — no preamble, no closing remarks, no code fences, no extra commentary.

Document content (raw extracted text):
\"\"\"
{trimmed}
\"\"\"
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mindlobby.app",
        "X-Title": "MindLobby Notes Generator"
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }

    try:
        logger.info(f"📡 Sending notes request to OpenRouter (model: {OPENROUTER_MODEL})...")
        response = requests.post(
            OPENROUTER_BASE_URL, headers=headers, json=payload, timeout=120
        )
        logger.info(f"📥 OpenRouter notes status: {response.status_code}")

        if not response.ok:
            logger.error(f"❌ OpenRouter notes error: {response.text}")
            # Fall back to raw markdown so the upload still succeeds
            return markdown_text

    except requests.exceptions.Timeout:
        logger.warning("⚠️ Notes generation timed out — falling back to raw markdown")
        return markdown_text
    except requests.exceptions.ConnectionError:
        logger.warning("⚠️ Notes generation connection error — falling back to raw markdown")
        return markdown_text
    except requests.exceptions.RequestException as e:
        logger.warning(f"⚠️ Notes generation failed: {e} — falling back to raw markdown")
        return markdown_text

    data = response.json()

    if 'error' in data:
        logger.warning("⚠️ OpenRouter notes API error — falling back to raw markdown")
        return markdown_text

    try:
        notes = data['choices'][0]['message']['content'].strip()
        # Strip code fences if the model wrapped output in them
        if notes.startswith("```"):
            notes = notes.split("```")[1]
            if notes.startswith("markdown"):
                notes = notes[8:]
            notes = notes.strip()
        logger.info(f"✅ Generated notes ({len(notes)} chars)")
        return notes
    except (KeyError, IndexError):
        logger.warning("⚠️ Unexpected notes response format — falling back to raw markdown")
        return markdown_text


# ============================================================================
# MCQ GENERATION (shared by solo quizzes and multiplayer)
# ============================================================================

def _pick_distractors(correct, other_answers, count=3):
    """Pick distractors that are similar in length/format to the correct answer."""
    if len(other_answers) <= count:
        return list(other_answers)

    correct_len = len(correct)
    correct_words = len(correct.split())

    scored = []
    for ans in other_answers:
        # Score by how similar the length and word count are (lower = more similar)
        length_ratio = len(ans) / max(correct_len, 1)
        word_ratio = len(ans.split()) / max(correct_words, 1)
        score = abs(1 - length_ratio) + abs(1 - word_ratio)
        scored.append((score, ans))

    scored.sort(key=lambda x: x[0])

    # Take the top candidates (2x needed), then randomly pick from those
    pool_size = min(len(scored), count * 2)
    candidates = [ans for _, ans in scored[:pool_size]]
    return random.sample(candidates, min(count, len(candidates)))


def generate_mcq_questions(cards):
    """
    Generate multiple-choice questions from flashcards.
    Uses smarter distractor selection (similar length/format).
    Returns a shuffled list of {id, question, options, correct_index}.
    """
    all_answers = [c['answer'] for c in cards]

    questions = []
    for i, card in enumerate(cards):
        correct = card['answer']
        other_answers = [a for j, a in enumerate(all_answers) if j != i]
        distractors = _pick_distractors(correct, other_answers, count=3)

        options = [correct] + distractors
        random.shuffle(options)

        questions.append({
            'id': card['id'],
            'question': card['question'],
            'options': options,
            'correct_index': options.index(correct),
        })

    random.shuffle(questions)
    return questions


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def process_file_to_flashcards(file_path, filename):
    """
    Full pipeline:
      1. MarkItDown converts the file to structured Markdown
      2. Markdown is sent to OpenRouter AI for flashcard generation
      3. Markdown is sent to OpenRouter AI for notes summarization

    Returns (flashcards_list, notes_markdown)
    """
    logger.info(f"🔄 Processing '{filename}'")
    markdown_text = extract_text(file_path, filename)

    # Run flashcard and notes generation in parallel to cut processing time in half
    with ThreadPoolExecutor(max_workers=2) as executor:
        fc_future = executor.submit(generate_flashcards, markdown_text)
        notes_future = executor.submit(generate_notes, markdown_text)
        flashcards = fc_future.result()
        notes = notes_future.result()

    return flashcards, notes