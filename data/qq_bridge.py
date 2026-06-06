"""QQ音乐桥接：搜索+播放链接"""
import asyncio, json, sys, os
# 强制 UTF-8 输出，避免 Windows GBK 乱码
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from qqmusic_api import Client, Credential

CRED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qq_credential.json")

def load_cred():
    try:
        if not os.path.exists(CRED_PATH):
            return None
        with open(CRED_PATH) as f:
            data = json.load(f)
        # 只传 Credential 需要的核心字段，避免多余字段导致 TypeError
        return Credential(
            openid=data.get("openid", ""),
            refresh_token=data.get("refresh_token", ""),
            access_token=data.get("access_token", ""),
            expired_at=data.get("expired_at", 0),
            musicid=data.get("musicid", 0),
            musickey=data.get("musickey", ""),
            unionid=data.get("unionid", ""),
        )
    except Exception as e:
        print(f"[bridge] Credential 加载失败: {e}", file=sys.stderr)
        return None

async def search_songs(keyword: str, limit: int = 5):
    api = Client(credential=load_cred())
    result = await api.search.search_by_type(keyword, num=limit)
    songs = result.song[:limit]
    if not songs:
        return []
    mids = [s.mid for s in songs]
    detail = await api.song.query_song(mids)
    tracks = detail.tracks
    urls_data = await api.song.get_song_urls(tracks)
    sip = urls_data.sip[0] if hasattr(urls_data, 'sip') and urls_data.sip else "http://ws.stream.qqmusic.qq.com/"

    out = []
    for i, track in enumerate(tracks):
        s = songs[i]
        purl = urls_data.data[i].purl if i < len(urls_data.data) and urls_data.data[i].purl else ""
        full_url = f"{sip}{purl}" if purl else ""
        out.append({
            "mid": track.mid,
            "title": track.title if hasattr(track, "title") else s.name,
            "artist": ", ".join(a.name for a in track.singer) if hasattr(track, "singer") else "",
            "cover": f"https://y.qq.com/music/photo_new/T002R300x300M000{s.album.mid}.jpg"
                     if hasattr(s, "album") and s.album and s.album.mid else "",
            "duration": track.interval * 1000 if hasattr(track, "interval") else 0,
            "url": full_url,
        })
    return out

async def get_urls_by_mid(mids_str: str):
    """根据 mid 获取播放链接"""
    mids = mids_str.split(",")
    api = Client(credential=load_cred())
    detail = await api.song.query_song(mids)
    tracks = detail.tracks
    urls_data = await api.song.get_song_urls(tracks)
    sip = urls_data.sip[0] if hasattr(urls_data, 'sip') and urls_data.sip else "http://ws.stream.qqmusic.qq.com/"
    out = {}
    for i, track in enumerate(tracks):
        purl = urls_data.data[i].purl if i < len(urls_data.data) and urls_data.data[i].purl else ""
        out[track.mid] = f"{sip}{purl}" if purl else ""
    return out

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "search"
    if cmd == "search":
        kw = sys.argv[2] if len(sys.argv) > 2 else "周杰伦"
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        print(json.dumps(asyncio.run(search_songs(kw, limit)), ensure_ascii=False))
    elif cmd == "url":
        mids = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(asyncio.run(get_urls_by_mid(mids)), ensure_ascii=False))
