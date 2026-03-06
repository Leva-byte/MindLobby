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
    "MindLobby \u2014 an AI-powered collaborative study platform created as a "
    "thesis project at Arellano University. You help students with study "
    "questions, explain concepts clearly, and guide them through using "
    "MindLobby's features.\n\n"
    "MindLobby features you should know about:\n"
    "- Upload Documents: Users can upload PDF, DOCX, PPTX, and TXT files to "
    "automatically generate flashcards using AI.\n"
    "- Flashcards: AI-generated question-and-answer cards from uploaded "
    "documents. Users can flip, navigate, shuffle, and restart cards.\n"
    "- Topics: Folders to organize documents by subject (e.g., Math, Science). "
    "Users can create topics, assign colors, and add documents to them.\n"
    "- Quick Play: Multiplayer study rooms where students can study together.\n"
    "- Studio: The main dashboard showing stats, recent activity, and quick "
    "actions.\n\n"
    "Keep responses concise (2-4 sentences when possible), encouraging, and "
    "use simple language suitable for students. Use bullet points for lists. "
    "If asked something outside your knowledge, be honest about it."
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
