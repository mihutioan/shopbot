# ==============================================================================
# ShopBot - FastAPI Backend
# ==============================================================================
# This is the main server file. It:
#   1. Accepts chat messages from the JavaScript widget
#   2. Loads the client's knowledge base (products, FAQ, instructions)
#   3. Sends everything to OpenAI GPT-4o-mini
#   4. Returns the AI response back to the widget
# ==============================================================================

import os
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from the .env file (OPENAI_API_KEY, SHOPBOT_API_KEY)
load_dotenv()

# ==============================================================================
# App Setup
# ==============================================================================

# Create the FastAPI application
app = FastAPI(title="ShopBot API", version="1.0.0")

# Allow requests from ANY website (needed so client websites can call our API)
# In production you might want to restrict this to known domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],        # Allow GET, POST, etc.
    allow_headers=["*"],        # Allow all headers including X-API-Key
)

# Create the OpenAI client using our API key from .env
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# This dictionary stores conversation history in memory.
# Key = session_id (a unique ID per browser tab / user session)
# Value = list of messages ({"role": "user", "content": "..."}, etc.)
# NOTE: This resets when the server restarts. For production, use Redis or a DB.
conversation_history: dict[str, list[dict]] = {}

# How many past messages to remember per session (5 exchanges = 10 messages)
MAX_HISTORY_MESSAGES = 10

# ==============================================================================
# Request / Response Models
# Pydantic models validate that incoming JSON has the right structure
# ==============================================================================

class ChatRequest(BaseModel):
    message: str           # The user's message, e.g. "Ce vitamine aveti?"
    session_id: str        # Unique per browser session, e.g. "abc123"
    client_id: str         # Which client's knowledge base to use, e.g. "biocyte"

class ChatResponse(BaseModel):
    reply: str             # The AI's response text
    session_id: str        # Echo back the session_id so frontend can track it

# ==============================================================================
# Helper Functions
# ==============================================================================

def load_knowledge_base(client_id: str) -> dict:
    """
    Loads the JSON knowledge base for a given client.
    The file must be at: knowledge/{client_id}.json

    Returns the parsed JSON as a Python dict.
    Raises a 404 error if the file doesn't exist.
    """
    # Build the file path, e.g. knowledge/biocyte.json
    knowledge_file = Path("knowledge") / f"{client_id}.json"

    if not knowledge_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge base not found for client: {client_id}"
        )

    with open(knowledge_file, "r", encoding="utf-8") as f:
        return json.load(f)


def build_system_prompt(knowledge: dict) -> str:
    """
    Converts the JSON knowledge base into a system prompt string
    that tells GPT how to behave for this specific client.

    The system prompt is the "instructions" message that GPT reads
    before the conversation starts.
    """
    business_name = knowledge.get("business_name", "Magazinul nostru")
    language = knowledge.get("language", "Romanian")
    instructions = knowledge.get("system_instructions", "")
    products = knowledge.get("products", [])
    faq = knowledge.get("faq", [])

    # Format the products list as readable text
    products_text = ""
    for product in products:
        products_text += f"\n- {product['name']}: {product['description']} (Pret: {product['price']})"
        if product.get("benefits"):
            products_text += f"\n  Beneficii: {', '.join(product['benefits'])}"

    # Format the FAQ list as readable text
    faq_text = ""
    for item in faq:
        faq_text += f"\nÎntrebare: {item['question']}\nRăspuns: {item['answer']}\n"

    # Combine everything into one system prompt
    system_prompt = f"""Ești un asistent virtual pentru {business_name}.

INSTRUCȚIUNI PRINCIPALE:
{instructions}

PRODUSELE DISPONIBILE:
{products_text}

ÎNTREBĂRI FRECVENTE:
{faq_text}

REGULI IMPORTANTE:
1. Răspunde ÎNTOTDEAUNA în {language}.
2. Răspunde DOAR la întrebări legate de {business_name} și produsele sale.
3. Dacă întrebarea nu are legătură cu business-ul, răspunde politicos:
   "Mă ocup doar cu întrebări despre {business_name}. Vă rog contactați-ne la [contact] pentru alte solicitări."
4. Fii prietenos, concis și orientat spre vânzare.
5. Când recomanzi produse, explică beneficiile relevante pentru problema clientului.
6. Dacă nu știi ceva specific, îndeamnă clientul să contacteze echipa.
"""

    return system_prompt


def get_session_history(session_id: str) -> list[dict]:
    """
    Returns the conversation history for a session.
    Creates an empty list if this is a new session.
    """
    if session_id not in conversation_history:
        conversation_history[session_id] = []
    return conversation_history[session_id]


def trim_history(history: list[dict]) -> list[dict]:
    """
    Keeps only the last MAX_HISTORY_MESSAGES messages.
    This prevents the context from growing too large (and expensive).
    """
    if len(history) > MAX_HISTORY_MESSAGES:
        # Keep only the most recent messages
        return history[-MAX_HISTORY_MESSAGES:]
    return history


def verify_api_key(x_api_key: Optional[str]) -> None:
    """
    Checks that the request has the correct API key in the X-API-Key header.
    Raises a 401 Unauthorized error if the key is missing or wrong.
    """
    expected_key = os.getenv("SHOPBOT_API_KEY")

    if not expected_key:
        # If no key is configured in .env, skip authentication (useful for local dev)
        return

    if x_api_key != expected_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key. Include X-API-Key header."
        )

# ==============================================================================
# API Endpoints
# ==============================================================================

@app.get("/health")
def health_check():
    """
    Simple health check endpoint.
    Use this to verify the server is running.
    Example: GET https://your-app.railway.app/health
    """
    return {"status": "ok", "service": "ShopBot API"}


@app.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    x_api_key: Optional[str] = Header(default=None)  # Read X-API-Key from request headers
):
    """
    Main chat endpoint. This is where all the magic happens.

    Flow:
    1. Verify API key
    2. Load the client's knowledge base
    3. Build the system prompt from the knowledge base
    4. Get or create conversation history for this session
    5. Add the user's message to history
    6. Send everything to OpenAI
    7. Save the AI response to history
    8. Return the response
    """

    # Step 1: Check API key
    verify_api_key(x_api_key)

    # Step 2: Load knowledge base for this client
    knowledge = load_knowledge_base(request.client_id)

    # Step 3: Build the system prompt
    system_prompt = build_system_prompt(knowledge)

    # Step 4: Get conversation history for this session
    history = get_session_history(request.session_id)

    # Step 5: Add the user's new message to history
    history.append({
        "role": "user",
        "content": request.message
    })

    # Trim history to avoid sending too many tokens to OpenAI
    history = trim_history(history)

    # Step 6: Build the full messages array for OpenAI
    # The system prompt goes first, then all conversation history
    messages_for_openai = [
        {"role": "system", "content": system_prompt}
    ] + history

    # Step 7: Call the OpenAI API
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",        # Affordable and fast model
            messages=messages_for_openai,
            max_tokens=500,             # Limit response length to control costs
            temperature=0.7,            # 0 = very precise, 1 = more creative
        )

        # Extract the AI's reply text
        ai_reply = response.choices[0].message.content

    except Exception as e:
        # If OpenAI call fails, return a friendly error
        raise HTTPException(
            status_code=500,
            detail=f"AI service error: {str(e)}"
        )

    # Step 8: Save the AI response to history and update the session
    history.append({
        "role": "assistant",
        "content": ai_reply
    })
    conversation_history[request.session_id] = history

    return ChatResponse(reply=ai_reply, session_id=request.session_id)


@app.get("/stats")
def get_stats(x_api_key: Optional[str] = Header(default=None)):
    """
    Returns basic usage stats for the admin dashboard.
    In production, these would come from a real database.
    """
    verify_api_key(x_api_key)

    total_sessions = len(conversation_history)
    total_messages = sum(len(msgs) for msgs in conversation_history.values())

    return {
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "active_sessions": total_sessions,  # All sessions are "active" in memory
    }


# ==============================================================================
# Run the server (only when running this file directly, not when imported)
# ==============================================================================
if __name__ == "__main__":
    import uvicorn
    # Run on port 8000 by default
    # Use port=int(os.getenv("PORT", 8000)) for Railway.app compatibility
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
