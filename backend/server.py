from fastapi import FastAPI, APIRouter, HTTPException, Request, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import json
import re
import time
from collections import defaultdict, deque
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Deque
import uuid
from datetime import datetime, timezone

from poker_engine import decide as engine_decide

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Security constants
MAX_IMAGE_BASE64_LEN = 8_000_000        # ~6MB decoded — plenty for any phone screenshot
ANALYZE_RATE_PER_MIN = 12                # per device_id / IP
DEVICE_ID_MIN_LEN = 8
DEVICE_ID_MAX_LEN = 128
DEVICE_ID_REGEX = re.compile(r"^[A-Za-z0-9\-_]+$")

# In-memory sliding-window rate limiter (per device / IP)
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Poker Trainer AI")
api_router = APIRouter(prefix="/api")


# -------------------- Helpers --------------------
def resolve_owner(request: Request, x_device_id: Optional[str]) -> str:
    """Return a stable owner id. Prefers X-Device-Id header (validated),
    falls back to client IP so legacy clients keep working (they just share
    a bucket by IP)."""
    if x_device_id:
        if (
            DEVICE_ID_MIN_LEN <= len(x_device_id) <= DEVICE_ID_MAX_LEN
            and DEVICE_ID_REGEX.match(x_device_id)
        ):
            return f"dev:{x_device_id}"
        # Bad header format — treat as anonymous rather than 400 so poor
        # clients keep working but can't spoof arbitrary owner ids.
        logger.info("Ignoring malformed X-Device-Id header")
    ip = request.client.host if request.client else "unknown"
    return f"ip:{ip}"


def rate_limit(owner: str, limit: int, window_s: int = 60) -> None:
    """Sliding window; raises 429 if over budget."""
    now = time.time()
    bucket = _rate_buckets[owner]
    # drop old entries
    while bucket and bucket[0] < now - window_s:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Muitas requisições. Aguarde alguns segundos e tente de novo.",
        )
    bucket.append(now)


# -------------------- Models --------------------
class DecideRequest(BaseModel):
    hero_cards: List[str] = Field(..., description="Ex: ['Ah', 'Kd']")
    community: List[str] = Field(default_factory=list)
    position: str = "BTN"
    to_call: float = 0
    pot: float = 1.5
    hero_stack: float = 100
    n_opponents: int = 1
    style: str = "balanced"  # tight | balanced | loose


class DecisionResponse(BaseModel):
    action: str
    bet_size: float
    confidence: float
    reasoning: str
    equity: Optional[Dict[str, float]] = None
    pot_odds: float
    chen_score: Optional[float] = None


class ImageAnalyzeRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class DetectedState(BaseModel):
    hero_cards: List[str] = []
    community: List[str] = []
    position: str = "BTN"
    to_call: float = 0
    pot: float = 0
    hero_stack: float = 100
    n_opponents: int = 1
    notes: str = ""
    detection_confidence: float = 0


class HistoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    hero_cards: List[str]
    community: List[str] = []
    position: str
    action: str
    bet_size: float
    confidence: float
    reasoning: str
    pot: float
    equity: Optional[Dict[str, float]] = None
    source: str = "manual"  # manual | image


class HistoryCreate(BaseModel):
    hero_cards: List[str]
    community: List[str] = []
    position: str
    action: str
    bet_size: float
    confidence: float
    reasoning: str
    pot: float
    equity: Optional[Dict[str, float]] = None
    source: str = "manual"


# -------------------- Routes --------------------
@api_router.get("/")
async def root():
    return {"message": "Poker Trainer AI API", "version": "1.1.0"}


@api_router.post("/decide", response_model=DecisionResponse)
async def decide_endpoint(req: DecideRequest):
    try:
        result = engine_decide(
            hero_cards=req.hero_cards,
            community=req.community,
            position=req.position,
            to_call=req.to_call,
            pot=req.pot,
            hero_stack=req.hero_stack,
            n_opponents=req.n_opponents,
            style=req.style,
        )
        return result
    except ValueError as e:
        # Client-facing message is safe (comes from our own engine).
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("decide error")
        raise HTTPException(status_code=500, detail="Erro no motor de decisão")


@api_router.post("/analyze-image")
async def analyze_image(
    payload: ImageAnalyzeRequest,
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
):
    """Analyze a poker table screenshot using Claude Sonnet 4.5 vision."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="Servidor mal configurado")

    # Rate limit (denial-of-wallet protection)
    owner = resolve_owner(request, x_device_id)
    rate_limit(owner, ANALYZE_RATE_PER_MIN, 60)

    # Size cap — reject before base64 decode / LLM call
    if len(payload.image_base64) > MAX_IMAGE_BASE64_LEN:
        raise HTTPException(
            status_code=413,
            detail="Imagem grande demais. Reduza a resolução e tente novamente.",
        )

    # Validate base64
    try:
        raw = base64.b64decode(payload.image_base64, validate=True)
        if len(raw) < 10:
            raise ValueError("empty image")
    except Exception:
        raise HTTPException(status_code=400, detail="Base64 inválido")

    system_msg = (
        "Você é um analista visual especialista em mesas de poker Texas Hold'em. "
        "Analise a imagem fornecida e extraia o estado da mesa. "
        "Cartas devem usar formato 2-caracter: rank (2-9,T,J,Q,K,A) + naipe (h=copas, d=ouros, c=paus, s=espadas). "
        "Ex: 'Ah' = Ás de copas, 'Td' = 10 de ouros. "
        "Responda APENAS em JSON válido (sem markdown), com o seguinte esquema:\n"
        "{\n"
        '  "hero_cards": ["Xx","Xx"],\n'
        '  "community": ["Xx",...],\n'
        '  "position": "UTG|MP|CO|BTN|SB|BB",\n'
        '  "to_call": number,\n'
        '  "pot": number,\n'
        '  "hero_stack": number,\n'
        '  "n_opponents": number,\n'
        '  "notes": "observações em português",\n'
        '  "detection_confidence": 0-100\n'
        "}\n"
        "Se não conseguir detectar algum campo, use lista vazia ou 0. Nunca invente cartas."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"poker-vision-{uuid.uuid4()}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        image_file = FileContent(
            content_type="image",
            file_content_base64=payload.image_base64,
        )
        msg = UserMessage(
            text="Analise a mesa de poker nesta imagem e retorne o JSON.",
            file_contents=[image_file],
        )
        response = await chat.send_message(msg)
        text = response if isinstance(response, str) else str(response)

        # Extract JSON from response (may contain preamble)
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return DetectedState(notes="Não foi possível interpretar a imagem.", detection_confidence=0)

        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            # Do NOT echo raw LLM text back — could contain injected content.
            return DetectedState(notes="JSON inválido retornado pela IA.", detection_confidence=0)

        detected = DetectedState(
            hero_cards=data.get("hero_cards", []) or [],
            community=data.get("community", []) or [],
            position=(data.get("position") or "BTN").upper(),
            to_call=float(data.get("to_call") or 0),
            pot=float(data.get("pot") or 0),
            hero_stack=float(data.get("hero_stack") or 100),
            n_opponents=int(data.get("n_opponents") or 1),
            notes=str(data.get("notes") or ""),
            detection_confidence=float(data.get("detection_confidence") or 0),
        )
        return detected
    except HTTPException:
        raise
    except Exception:
        logger.exception("analyze_image error")
        raise HTTPException(status_code=500, detail="Erro na análise da imagem")


@api_router.post("/history", response_model=HistoryEntry)
async def create_history(
    entry: HistoryCreate,
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
):
    owner = resolve_owner(request, x_device_id)
    obj = HistoryEntry(**entry.dict())
    doc = obj.dict()
    doc["_owner"] = owner
    await db.history.insert_one(doc)
    return obj


@api_router.get("/history", response_model=List[HistoryEntry])
async def list_history(
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    limit: int = 50,
):
    owner = resolve_owner(request, x_device_id)
    limit = max(1, min(int(limit), 200))
    docs = (
        await db.history
        .find({"_owner": owner}, {"_id": 0, "_owner": 0})
        .sort("timestamp", -1)
        .to_list(limit)
    )
    return [HistoryEntry(**d) for d in docs]


@api_router.delete("/history/{entry_id}")
async def delete_history(
    entry_id: str,
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
):
    owner = resolve_owner(request, x_device_id)
    res = await db.history.delete_one({"id": entry_id, "_owner": owner})
    return {"deleted": res.deleted_count}


@api_router.delete("/history")
async def clear_history(
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
):
    owner = resolve_owner(request, x_device_id)
    res = await db.history.delete_many({"_owner": owner})
    return {"deleted": res.deleted_count}


app.include_router(api_router)

# CORS: keep open for the mobile app / preview URL, but drop credentials
# since we don't rely on cookies. This makes the wildcard * safe.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Device-Id"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
