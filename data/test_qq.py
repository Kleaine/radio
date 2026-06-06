import asyncio
from qqmusic_api import Client

async def main():
    api = Client()
    urls = await api.song.get_song_urls(["001vUwvU1H6Ezj"])
    print("URLs:", urls)

asyncio.run(main())
