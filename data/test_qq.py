import asyncio, json
from qqmusic_api import Client

async def main():
    api = Client()
    result = await api.search.search_by_type("周杰伦", num=2)
    # dump the full model
    data = result.model_dump()
    with open("C:/Users/Administrator/Desktop/ai 电台/radio-repo/data/qq_result.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("DONE - keys:", list(data.keys()))

asyncio.run(main())
