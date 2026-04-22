"""
Paw-Data 반려동물 거주지 추천 서비스 - FastAPI 백엔드
실행: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

# ════════════════════════════════════════════════════════════
# 0. Import
# ════════════════════════════════════════════════════════════
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import create_engine, text
from motor.motor_asyncio import AsyncIOMotorClient
from sshtunnel import SSHTunnelForwarder
import pandas as pd
import os

# ════════════════════════════════════════════════════════════
# 1. FastAPI 앱 (단 1개)
# ════════════════════════════════════════════════════════════
app = FastAPI(title="Paw-Data API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ════════════════════════════════════════════════════════════
# 2. MySQL 연결 (192.168.0.164)
# ════════════════════════════════════════════════════════════
engine = create_engine(
    "mysql+pymysql://root:pass123#@192.168.0.164:3306/petdb?charset=utf8mb4",
    pool_pre_ping=True
)

# ════════════════════════════════════════════════════════════
# 3. MongoDB 연결 (192.168.0.165) — SSH 터널 경유
# ════════════════════════════════════════════════════════════
tunnel = SSHTunnelForwarder(
    ("192.168.0.165", 22),
    ssh_username="root",
    ssh_password="pass123#",
    remote_bind_address=("127.0.0.1", 27017),
    local_bind_address= ("127.0.0.1", 27018),
)
tunnel.start()
print(f"✅ SSH 터널 연결 완료 → 포트 {tunnel.local_bind_port}")

mongo_client = AsyncIOMotorClient(
    f"mongodb://teamys:pass123%23@127.0.0.1:{tunnel.local_bind_port}/?authSource=admin"
)
mongo_db = mongo_client.pet_data

# ════════════════════════════════════════════════════════════
# 4. CSV 로드 및 전처리
# ════════════════════════════════════════════════════════════
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR,
    "한국문화정보원_전국 반려동물 동반 가능 문화시설 위치 데이터_20250324.csv")

CATEGORY_MAP = {
    "동물병원": "의료건강", "동물약국": "의료건강",
    "미용": "미용돌봄",     "위탁관리": "미용돌봄",
    "반려동물용품": "일반용품", "카페": "일반용품",
    "식당": "일반용품",     "펜션": "일반용품",
    "호텔": "일반용품",     "여행지": "일반용품",
    "박물관": "일반용품",   "미술관": "일반용품",
    "문예회관": "일반용품",
}
HYGIENE_KEYWORDS = ["목욕", "샴푸", "위생", "세척", "청결", "세탁", "그루밍"]
CATEGORIES = ["의료건강", "위생", "일반용품", "미용돌봄"]

def assign_category(row):
    if any(kw in str(row["시설명"]) for kw in HYGIENE_KEYWORDS):
        return "위생"
    return CATEGORY_MAP.get(row["카테고리3"], "일반용품")

def load_data():
    df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
    df["4개_카테고리"] = df.apply(assign_category, axis=1)
    df = df[df["시도 명칭"] == "서울특별시"].copy()
    df = df.dropna(subset=["위도", "경도"])
    df["위도"] = pd.to_numeric(df["위도"], errors="coerce")
    df["경도"] = pd.to_numeric(df["경도"], errors="coerce")
    df = df.dropna(subset=["위도", "경도"])
    print(f"✅ CSV 로드 완료 — 서울 시설 수: {len(df):,}")
    return df

df_global = load_data()

def compute_gu_scores():
    scores = {}
    for gu in df_global["시군구 명칭"].unique():
        gu_df = df_global[df_global["시군구 명칭"] == gu]
        scores[gu] = {cat: len(gu_df[gu_df["4개_카테고리"] == cat]) for cat in CATEGORIES}
    return scores

GU_RAW_COUNTS = compute_gu_scores()
CAT_MAX = {cat: max(v[cat] for v in GU_RAW_COUNTS.values()) or 1 for cat in CATEGORIES}

def build_gu_base_data():
    """App.js BASE_DATA 구조와 동일한 형태로 반환"""
    base = {}
    for gu, counts in GU_RAW_COUNTS.items():
        base[gu] = {
            "hospital":  round(counts["의료건강"] / CAT_MAX["의료건강"] * 100, 1),
            "park":      round(counts["일반용품"] / CAT_MAX["일반용품"] * 100, 1),
            "transport": round(counts["미용돌봄"] / CAT_MAX["미용돌봄"] * 100, 1),
            "quiet":     round(counts["위생"]     / CAT_MAX["위생"]     * 100, 1),
        }
    return base

GU_BASE_DATA = build_gu_base_data()

# ── 시장 분석 CSV 로드 (test.py 실행 결과물) ─────────────────
def load_market_csv(filename):
    path = os.path.join(BASE_DIR, filename)
    if os.path.exists(path):
        return pd.read_csv(path, encoding="utf-8-sig")
    return None

df_current  = load_market_csv("integrated_current.csv")
df_compare  = load_market_csv("integrated_compare.csv")
df_estimated= load_market_csv("integrated_estimated.csv")

# ════════════════════════════════════════════════════════════
# 5. 요청/응답 모델
# ════════════════════════════════════════════════════════════
class WeightRequest(BaseModel):
    park:      float = 3.0
    hospital:  float = 3.0
    transport: float = 3.0
    quiet:     float = 3.0

class GuScore(BaseModel):
    name:      str
    score:     float
    rank:      int
    hospital:  float
    park:      float
    transport: float
    quiet:     float

class FacilityItem(BaseModel):
    name:     str
    category: str
    cat3:     str
    lat:      float
    lng:      float
    address:  Optional[str]
    phone:    Optional[str]

# ════════════════════════════════════════════════════════════
# 6. API 엔드포인트
# ════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "ok", "message": "Paw-Data API 정상 동작"}


# ── GeoJSON 서빙 ─────────────────────────────────────────────
@app.get("/seoul_gu.geojson")
def serve_geojson():
    path = os.path.join(BASE_DIR, "seoul_gu.geojson")
    if not os.path.exists(path):
        return {"error": "seoul_gu.geojson 파일이 없습니다"}
    return FileResponse(path, media_type="application/json")


# ── 자치구 BASE_DATA 제공 ─────────────────────────────────────
@app.get("/api/gu_data")
def get_gu_data():
    """App.js BASE_DATA 대체 — DB 기반 실데이터"""
    return GU_BASE_DATA


# ── 자치구 추천 ───────────────────────────────────────────────
@app.post("/api/recommend")
def recommend_gu(weights: WeightRequest):
    """가중치 기반 자치구 점수 계산 — App.js calcScore()와 동일 로직"""
    wd = {"park": weights.park, "hospital": weights.hospital,
          "transport": weights.transport, "quiet": weights.quiet}
    total_w = sum(wd.values())

    results = []
    for gu, data in GU_BASE_DATA.items():
        score = (sum(data[k] * wd[k] for k in wd) / total_w) if total_w > 0 else 0
        results.append({
            "name":      gu,
            "score":     round(score, 1),
            "hospital":  data["hospital"],
            "park":      data["park"],
            "transport": data["transport"],
            "quiet":     data["quiet"],
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return [GuScore(**r) for r in results]


# ── 자치구별 시설 목록 ────────────────────────────────────────
@app.get("/api/facilities/{gu_name}", response_model=list[FacilityItem])
def get_facilities(
    gu_name:  str,
    category: Optional[str] = Query(None),
    limit:    int            = Query(500),
):
    gu_df = df_global[df_global["시군구 명칭"] == gu_name]
    if category:
        gu_df = gu_df[gu_df["4개_카테고리"] == category]
    return [
        FacilityItem(
            name=str(row["시설명"]),
            category=str(row["4개_카테고리"]),
            cat3=str(row["카테고리3"]),
            lat=float(row["위도"]),
            lng=float(row["경도"]),
            address=str(row["도로명주소"]) if pd.notna(row["도로명주소"]) else None,
            phone=str(row["전화번호"])     if pd.notna(row["전화번호"])   else None,
        )
        for _, row in gu_df.head(limit).iterrows()
    ]


# ── 자치구 목록 ───────────────────────────────────────────────
@app.get("/api/gu_list")
def get_gu_list():
    return {"gus": sorted(df_global["시군구 명칭"].unique().tolist())}


# ── 상권 분석 대시보드 데이터 ─────────────────────────────────
@app.get("/api/dashboard")
def get_dashboard():
    """
    Dashboard.js용 행정동별 시설 현황
    MySQL petdb에 dong_stats 테이블이 있으면 DB에서 조회
    없으면 CSV 기반 자치구 데이터 반환
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT name, 의료건강, 위생, 일반용품, 미용돌봄, 반려동물수
                FROM   dong_stats
                ORDER BY name
            """)).fetchall()
        if rows:
            return [dict(row._mapping) for row in rows]
    except Exception:
        pass

    # fallback: 자치구 기반 데이터
    result = []
    for gu in sorted(df_global["시군구 명칭"].unique()):
        gu_df = df_global[df_global["시군구 명칭"] == gu]
        result.append({
            "name":      gu,
            "total":     len(gu_df),
            "의료건강":  len(gu_df[gu_df["4개_카테고리"] == "의료건강"]),
            "위생":      len(gu_df[gu_df["4개_카테고리"] == "위생"]),
            "일반용품":  len(gu_df[gu_df["4개_카테고리"] == "일반용품"]),
            "미용돌봄":  len(gu_df[gu_df["4개_카테고리"] == "미용돌봄"]),
            "반려동물수": 0,
        })
    return result


# ── 시장 분석: 워드클라우드 키워드 ───────────────────────────
@app.get("/api/market/keywords")
def get_market_keywords():
    """MarketDashboard.js 워드클라우드용 키워드 검색량"""
    if df_current is None:
        return []
    df_sorted = df_current.nlargest(30, "현재_총")
    return [[row["키워드"], int(row["현재_총"] // 500)] for _, row in df_sorted.iterrows()]


# ── 시장 분석: 분야별 비중 (도넛 차트) ───────────────────────
@app.get("/api/market/share")
def get_market_share():
    """MarketDashboard.js 도넛 차트 + 트리맵용"""
    if df_current is None:
        return {}

    COLORS = {
        "1_반려동물먹거리": "#FB7185",
        "2_미용위생":       "#4ADE80",
        "3_서비스업":       "#22D3EE",
        "4_공산품":         "#34D399",
        "5_의료건강":       "#FDE68A",
    }
    NAME_MAP = {
        "1_반려동물먹거리": "반려동물 식품",
        "2_미용위생":       "미용위생",
        "3_서비스업":       "서비스업",
        "4_공산품":         "일반용품",
        "5_의료건강":       "의료건강",
    }

    total = df_current["현재_총"].sum()
    result = {}

    for cat in df_current["분야"].unique():
        cat_df  = df_current[df_current["분야"] == cat]
        cat_sum = cat_df["현재_총"].sum()
        display = NAME_MAP.get(cat, cat)
        color   = COLORS.get(cat, "#999")

        treemap = [
            {"name": row["키워드"], "size": int(row["현재_총"]), "color": color}
            for _, row in cat_df.nlargest(8, "현재_총").iterrows()
        ]
        result[display] = {
            "color":   color,
            "value":   round(cat_sum / total * 100, 1) if total > 0 else 0,
            "treemap": treemap,
        }
    return result


# ── 시장 분석: 성장률 (바 차트) ─────────────────────────────
@app.get("/api/market/growth")
def get_market_growth():
    """MarketDashboard.js 성장률 바차트용"""
    if df_compare is None:
        return []
    NAME_MAP = {
        "1_반려동물먹거리": "반려동물 식품",
        "2_미용위생":       "미용위생",
        "3_서비스업":       "서비스업",
        "4_공산품":         "일반용품",
        "5_의료건강":       "의료건강",
    }
    return [
        {
            "name":  NAME_MAP.get(row["분야"], row["분야"]),
            "value": float(row["최근3개월_성장률"]),
        }
        for _, row in df_compare.sort_values("최근3개월_성장률", ascending=False).iterrows()
    ]


# ── 시장 분석: 월별 추이 (라인 차트) ────────────────────────
@app.get("/api/market/trend")
def get_market_trend():
    """MarketDashboard.js 월별 추이 라인차트용"""
    if df_estimated is None:
        return []

    CAT_MAP = {
        "1_반려동물먹거리": "식품",
        "5_의료건강":       "의료",
        "4_공산품":         "일반용품",
    }
    df_est = df_estimated.copy()
    df_est["날짜_dt"] = pd.to_datetime(df_est["날짜"])
    df_est = df_est[df_est["분야"].isin(CAT_MAP.keys())]

    monthly = df_est.groupby(["날짜", "분야"])["추정_총검색량"].mean().reset_index()
    pivot   = monthly.pivot(index="날짜", columns="분야", values="추정_총검색량").reset_index()
    pivot   = pivot.rename(columns=CAT_MAP)
    pivot   = pivot.rename(columns={"날짜": "date"})
    pivot   = pivot.fillna(0)

    return pivot.tail(12).to_dict(orient="records")


# ── MongoDB 시설 조회 ─────────────────────────────────────────
@app.get("/api/mongo/facilities")
async def get_mongo_facilities(
    gu_name: Optional[str] = Query(None),
    limit:   int           = Query(1000),
):
    collection = mongo_db.mongo_facility
    query      = {"sigungu": gu_name} if gu_name else {}
    data       = await collection.find(query, {"_id": 0}).to_list(limit)
    return {"status": "success", "count": len(data), "data": data}


# ── 자치구 통계 요약 ─────────────────────────────────────────
@app.get("/api/summary")
def get_summary():
    summary = {}
    for gu, counts in GU_RAW_COUNTS.items():
        summary[gu] = {"total": sum(counts.values()), **counts}
    return summary


# ── 전체 연동 상태 확인 ───────────────────────────────────────
@app.get("/api/health")
async def health_check():
    result = {
        "backend": "✅ 정상",
        "csv":     f"✅ 서울 시설 {len(df_global):,}건",
        "market_csv": "✅ 로드됨" if df_current is not None else "❌ 없음 (integrated_current.csv 필요)",
        "mysql":   "❌ 미확인",
        "mongodb": "❌ 미확인",
    }
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        result["mysql"] = "✅ 연결 정상"
    except Exception as e:
        result["mysql"] = f"❌ 실패: {str(e)[:60]}"

    try:
        count = await mongo_db.mongo_facility.count_documents({})
        result["mongodb"] = f"✅ 연결 정상 (문서 수: {count:,})"
    except Exception as e:
        result["mongodb"] = f"❌ 실패: {str(e)[:60]}"

    return result
