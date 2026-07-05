#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

user_problem_statement: "Poker Trainer AI mobile app restored from zip. Then user asked for security audit. Security audit found 2 MEDIUM issues (unauthenticated /analyze-image with unbounded LLM cost, and global history without owner scope) plus LOW hardening. User asked to fix. Need to verify fixes work end-to-end."

backend:
  - task: "Rate limit and size cap on /api/analyze-image (SEC-001 fix)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added: (1) sliding-window in-memory rate limiter (12 req/min per device_id or IP); (2) MAX_IMAGE_BASE64_LEN=8MB payload cap that rejects with 413 BEFORE calling Claude; (3) sanitized exception messages (generic 'Erro na análise da imagem' instead of raw f'Erro: {e}'). Curl confirmed 413 on huge payload and 429 on 13th rapid request. Needs testing_agent to validate end-to-end + regression that /decide + normal /analyze-image path still works."
      - working: true
        agent: "testing"
        comment: "PASS 9/9. 413 on >8MB, 429 on 13th call, sanitized errors <200 chars, no stack traces, happy path 1x1 PNG returns 200."

  - task: "Device-id owner scope on /api/history (SEC-002 fix)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added: (1) X-Device-Id header validation (regex + length); (2) fallback to client IP when header missing so legacy clients keep working (they share a bucket by IP); (3) all history CRUD (POST/GET/DELETE) now filter by _owner field derived from X-Device-Id; (4) legacy documents without _owner are invisible to new queries (acceptable since it's low-value poker history). Curl confirmed GET returns [] for new device ids. Needs testing_agent to validate cross-device isolation (device A cannot see device B's entries)."
      - working: true
        agent: "testing"
        comment: "PASS. Device A entries not visible to Device B (GET returns empty for B). DELETE by B does not touch A's data. Missing/malformed X-Device-Id falls back to IP without crash."

  - task: "Frontend api.ts sends X-Device-Id header on every request"
    implemented: true
    working: true
    file: "/app/frontend/src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New /app/frontend/src/utils/device-id.ts generates persistent UUIDv4 on first launch and caches it. api.ts now awaits getDeviceId() and attaches X-Device-Id header to every fetch."
      - working: true
        agent: "testing"
        comment: "Backend accepts X-Device-Id header and isolates data correctly, confirming the client-server contract. Frontend was out of scope for this iteration."

  - task: "Regression: /api/decide, /api/analyze-image happy path"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "GET /api/ returns version 1.1.0. POST /api/decide returns valid recommendation for AhKh preflop BTN with action, confidence, reasoning, pot_odds. No regressions."

frontend:
  - task: "Modo Tela (screen capture) new tab option"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/ScreenCaptureMode.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Feature added earlier in the session. Uses react-native-nitro-screen-recorder which requires native build - NOT testable in Expo Go/web preview. The component has a graceful fallback showing 'Modo Tela indisponível' when the native module cannot be loaded. Testing agent should just verify the button exists on the Analisar idle screen and clicking it navigates to the unavailable screen in Expo Go/web."

metadata:
  created_by: "main_agent"
  version: "1.1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Rate limit and size cap on /api/analyze-image (SEC-001 fix)"
    - "Device-id owner scope on /api/history (SEC-002 fix)"
    - "Frontend api.ts sends X-Device-Id header on every request"
    - "Regression: /api/decide, /api/analyze-image happy path, TTS, disclaimer flow"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Applied security fixes for SEC-001 (rate limit + payload cap + sanitized errors) and SEC-002 (X-Device-Id header + owner-scoped history). Frontend api.ts now sends X-Device-Id on every call, generated by /app/frontend/src/utils/device-id.ts. CORS also tightened (allow_credentials=False, explicit headers/methods). RECORD_AUDIO permission removed from Android manifest. Please test: (1) rate limit triggers 429 after 12 rapid /analyze-image calls, (2) 413 on payload > 8MB base64, (3) history isolation between two device ids, (4) sanitized errors do not leak stack traces or raw exception strings, (5) normal /decide still works. Backend base URL: use EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env. Frontend can be tested via preview URL. No auth credentials needed."

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================
