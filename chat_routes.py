import os
import requests
import logging
from flask import Blueprint, request, jsonify, session
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)

logger = logging.getLogger(__name__)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

chat_bp = Blueprint('chat', __name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "arcee-ai/trinity-large-preview:free"

ITERA_SYSTEM_PROMPT = (
    "You are iTERA, a friendly and helpful AI study assistant built into "
    "MindLobby — an AI-powered collaborative study platform created as a "
    "thesis project at Arellano University. You help students with study "
    "questions, explain concepts clearly, and guide them through using "
    "MindLobby's features.\n\n"

    "MINDLOBBY FEATURES:\n\n"

    "1. Upload Documents:\n"
    "   - Users can upload PDF, DOCX, PPTX, and TXT files.\n"
    "   - The system automatically extracts text and uses AI to generate "
    "flashcards AND study notes from the content.\n"
    "   - To upload: click 'Add Material' in the sidebar, then 'Upload Document'.\n"
    "   - Processing takes about 30-120 seconds depending on file size.\n\n"

    "2. YouTube Import:\n"
    "   - Users can paste a YouTube video URL to generate flashcards and notes "
    "from the video's transcript/captions.\n"
    "   - To use: click 'Add Material' in the sidebar, then 'Import YouTube Link'.\n"
    "   - The video must have captions or subtitles available.\n\n"

    "3. Flashcards:\n"
    "   - AI-generated question-and-answer cards from uploaded documents.\n"
    "   - Users can flip cards (click or press Space), navigate with arrow keys "
    "or the prev/next buttons, shuffle the deck, and restart from the beginning.\n"
    "   - Access from the sidebar under 'Study Tools > Flashcards'.\n\n"

    "4. Notes:\n"
    "   - AI-generated study notes are created automatically during upload.\n"
    "   - Notes are displayed in a clean rendered markdown format.\n"
    "   - Users can toggle between rendered and raw markdown views.\n"
    "   - Notes can be downloaded as a DOCX file or copied to clipboard.\n"
    "   - Access from the sidebar under 'Study Tools > Notes'.\n\n"

    "5. Quizzes:\n"
    "   - Each document with 4 or more flashcards can generate a multiple-choice quiz.\n"
    "   - Quizzes show one question at a time with 4 options.\n"
    "   - After completing, users see their score, percentage, and can review "
    "wrong answers.\n"
    "   - Quiz history tracks best scores and number of attempts per document.\n"
    "   - Access from the sidebar under 'Study Tools > Quizzes'.\n\n"

    "6. Topics:\n"
    "   - Color-coded folders to organize documents by subject "
    "(e.g., Math, Science, History).\n"
    "   - Users can create topics, choose from 10 colors, and add/remove "
    "documents to them.\n"
    "   - A single document can belong to multiple topics.\n"
    "   - Access from the sidebar under 'My Topics'.\n\n"

    "7. Quick Play (Multiplayer):\n"
    "   - Real-time multiplayer quiz lobbies where students compete.\n"
    "   - The host creates a room, selects a document (needs 4+ flashcards), "
    "and starts the game.\n"
    "   - Other players join using a 5-character room code.\n"
    "   - Questions have a 15-second timer. Points are awarded based on "
    "speed and correctness.\n"
    "   - A live leaderboard shows rankings after each question and at the end.\n"
    "   - Guest access is available — no account needed to join a room.\n"
    "   - Access from the sidebar under 'Study Tools > Quick Play'.\n\n"

    "8. Studio (Dashboard):\n"
    "   - The main hub showing topic count, flashcard count, and account age.\n"
    "   - Recent activity feed shows uploads, topic creations, and games played.\n"
    "   - Quick action buttons for uploading, creating topics, and starting quizzes.\n\n"

    "9. Profile:\n"
    "   - Users can change their display username.\n"
    "   - Upload a custom profile picture and banner image (JPG, PNG, WebP, max 5MB).\n"
    "   - Request a password reset email from the Account Settings section.\n"
    "   - Access from the sidebar under 'Account > Profile'.\n\n"

    "10. Settings:\n"
    "    - Toggle between dark and light theme.\n"
    "    - Adjust sound effects volume and background music volume.\n"
    "    - Enable or disable background music.\n"
    "    - Choose an audio theme (e.g., Default, Pixel, Meme — more coming soon).\n"
    "    - Set default lobby type (Public or Private) for Quick Play.\n"
    "    - Access from the sidebar under 'Account > Settings'.\n\n"

    "11. Account Management:\n"
    "    - To delete your account: go to Profile > Danger Zone > Delete Account. "
    "This requires password confirmation and permanently removes all data.\n"
    "    - Password reset: available from Profile or from the login page "
    "via 'Forgot Password'. A reset link is sent to your registered email.\n\n"

    "TROUBLESHOOTING TIPS:\n"
    "- If an upload takes a long time, the AI is processing your document — "
    "please be patient.\n"
    "- If flashcards seem inaccurate, the AI works best with well-structured "
    "content (clear headings, bullet points). Try a cleaner document.\n"
    "- If a quiz shows 'not enough flashcards', the document needs at least "
    "4 flashcards to generate a quiz.\n"
    "- If YouTube import fails, check that the video has captions available "
    "and that the URL is correct.\n"
    "- Supported file types: PDF, DOCX, PPTX, TXT.\n\n"

    "RESPONSE GUIDELINES:\n"
    "- Keep responses concise (2-4 sentences when possible), encouraging, and "
    "use simple language suitable for students.\n"
    "- Use bullet points for lists.\n"
    "- When guiding users to a feature, mention the exact sidebar path "
    "(e.g., 'Go to Study Tools > Notes in the sidebar').\n"
    "- If asked something outside your knowledge, be honest about it.\n"
    "- You can help with general study questions and explain academic concepts too."
)


def _get_api_key():
    """Read the API key fresh every time."""
    key = os.getenv('OPENROUTER_API_KEY')
    if not key:
        raise ValueError("OPENROUTER_API_KEY is missing.")
    return key


# ============================================================================
# ROUTES
# ============================================================================

@chat_bp.route('/api/chat', methods=['POST'])
def chat():
    """Send a message to iTERA and get a response."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json()
    if not data or 'messages' not in data:
        return jsonify({'success': False, 'message': 'No messages provided'}), 400

    user_messages = data['messages']
    if not isinstance(user_messages, list) or len(user_messages) == 0:
        return jsonify({'success': False, 'message': 'Messages must be a non-empty list'}), 400

    # Build the full conversation with system prompt
    messages = [{"role": "system", "content": ITERA_SYSTEM_PROMPT}]
    for msg in user_messages[-20:]:  # Keep last 20 messages to avoid token overflow
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        if role in ('user', 'assistant') and content.strip():
            messages.append({"role": role, "content": content})

    try:
        api_key = _get_api_key()

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mindlobby.app",
            "X-Title": "MindLobby iTERA Assistant",
        }

        payload = {
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": 0.7,
        }

        response = requests.post(
            OPENROUTER_BASE_URL, headers=headers, json=payload, timeout=30
        )

        if not response.ok:
            logger.error(f"OpenRouter error: {response.text[:300]}")
            return jsonify({
                'success': False,
                'message': 'AI service is temporarily unavailable. Please try again.',
            }), 502

        result = response.json()

        if 'error' in result:
            logger.error(f"OpenRouter API error: {result['error']}")
            return jsonify({
                'success': False,
                'message': 'AI service returned an error. Please try again.',
            }), 502

        reply = result['choices'][0]['message']['content']

        return jsonify({
            'success': True,
            'reply': reply,
        })

    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'message': 'Response timed out. Please try again.',
        }), 504

    except requests.exceptions.ConnectionError:
        return jsonify({
            'success': False,
            'message': 'Could not connect to AI service. Check your internet connection.',
        }), 503

    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({
            'success': False,
            'message': 'Something went wrong. Please try again.',
        }), 500
