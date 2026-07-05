from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import json
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
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

app = FastAPI(title="Poker Trainer AI")
api_router = APIRouter(prefix="/api")

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
    return {"message": "Poker Trainer AI API", "version": "1.0.0"}


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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.exception("decide error")
        raise HTTPException(status_code=500, detail=f"Erro no motor: {e}")


@api_router.post("/analyze-image")
async def analyze_image(req: ImageAnalyzeRequest):
    """Analyze a poker table screenshot using Claude Sonnet 4.5 vision."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY não configurada")

    # Validate base64 image
    try:
        raw = base64.b64decode(req.image_base64, validate=True)
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
            file_content_base64=req.image_base64,
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
            return DetectedState(notes=f"JSON inválido: {text[:150]}", detection_confidence=0)

        # Normalize
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
    except Exception as e:
        logging.exception("analyze_image error")
        raise HTTPException(status_code=500, detail=f"Erro na análise da imagem: {e}")


@api_router.post("/history", response_model=HistoryEntry)
async def create_history(entry: HistoryCreate):
    obj = HistoryEntry(**entry.dict())
    await db.history.insert_one(obj.dict())
    return obj


@api_router.get("/history", response_model=List[HistoryEntry])
async def list_history(limit: int = 50):
    docs = await db.history.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return [HistoryEntry(**d) for d in docs]


@api_router.delete("/history/{entry_id}")
async def delete_history(entry_id: str):
    res = await db.history.delete_one({"id": entry_id})
    return {"deleted": res.deleted_count}


@api_router.delete("/history")
async def clear_history():
    res = await db.history.delete_many({})
    return {"deleted": res.deleted_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
