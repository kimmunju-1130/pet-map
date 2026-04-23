
import asyncio
from sshtunnel import SSHTunnelForwarder
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    # SSH 터널 생성
    tunnel = SSHTunnelForwarder(
        ("192.168.0.165", 22),
        ssh_username="root",
        ssh_password="pass123#",
        remote_bind_address=("127.0.0.1", 27017),
        local_bind_address= ("127.0.0.1", 27018),
    )
    tunnel.start()
    print(f"✅ SSH 터널 연결 완료 → 포트 {tunnel.local_bind_port}")

    try:
        client = AsyncIOMotorClient(
            f"mongodb://teamys:pass123%23@127.0.0.1:{tunnel.local_bind_port}/?authSource=admin",
            serverSelectionTimeoutMS=5000
        )
        db    = client.pet_data
        count = await db.mongo_facility.count_documents({})
        print(f"✅ MongoDB 연결 성공 — 문서 수: {count:,}")
    except Exception as e:
        print(f"❌ 연결 실패: {e}")
    finally:
        tunnel.stop()

asyncio.run(test())
