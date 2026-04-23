# db_test.py — 백엔드 서버(192.168.0.47)에서 실행
import pymysql

try:
    conn = pymysql.connect(
        host     = "192.168.0.164",
        port     = 3306,
        user     = "root",
        password = "pass123#",
        database = "petdb",
        charset  = "utf8mb4"
    )
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM facility")
    count = cursor.fetchone()[0]
    print(f"✅ DB 연결 성공 — 시설 데이터 {count:,}건 확인")
    conn.close()
except Exception as e:
    print(f"❌ DB 연결 실패: {e}")
