from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from sqlalchemy import create_engine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ✅ 모든 origin 허용
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_HOST = "192.168.0.164"
DB_PORT = 3306
DB_USER = "root"
DB_PASS = "pass123#"
DB_NAME = "petdb"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    echo=False
)

@app.get("/api/dashboard")
def get_dashboard():
    query = """
        SELECT
            s.sigungu_name AS name,
            SUM(CASE WHEN cs.category_main_id = 1 THEN 1 ELSE 0 END) AS 의료건강,
            SUM(CASE WHEN cs.category_sub_id = 6 THEN 1 ELSE 0 END) AS 위생,
            SUM(CASE WHEN cs.category_sub_id = 5 THEN 1 ELSE 0 END) AS 일반용품,
            SUM(CASE WHEN cs.category_main_id = 4
                      AND cs.category_sub_id NOT IN (5,6) THEN 1 ELSE 0 END) AS 미용돌봄,
            (SELECT COALESCE(r2.registered_count, 0)
             FROM registration r2
             WHERE r2.sigungu_id = s.sigungu_id
             LIMIT 1) AS 반려동물수
        FROM facility f
        JOIN address a       ON f.address_id = a.address_id
        JOIN sigungu s       ON a.sigungu_id = s.sigungu_id
        JOIN category_sub cs ON f.category_sub_id = cs.category_sub_id
        WHERE s.sido_id = 9
        GROUP BY s.sigungu_id, s.sigungu_name
        ORDER BY s.sigungu_name
    """
    try:
        df = pd.read_sql(query, engine)
        return df.to_dict(orient="records")  # ✅ df['name'] = df['gu'] 제거
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
def root():
    return {"status": "ok", "message": "Paw-Data API 서버 실행 중"}