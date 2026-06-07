"""QQ音乐桥接：搜索+播放链接（适配 qqmusic_api 0.5.x）"""
import asyncio, json, sys, os
# 强制 UTF-8 输出，避免 Windows GBK 乱码
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from qqmusic_api import Client, Credential
from qqmusic_api.modules.song import SongFileInfo, SongFileType

CRED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qq_credential.json")

# 默认 SIP 服务器
DEFAULT_SIP = "http://ws.stream.qqmusic.qq.com/"

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
    cred = load_cred()
    api = Client(credential=cred)
    result = await api.search.search_by_type(keyword, num=limit)
    songs = result.song[:limit]
    if not songs:
        return []

    # 获取歌曲详情
    mids = [s.mid for s in songs]
    detail = await api.song.query_song(mids)
    tracks = detail.tracks
    track_map = {t.mid: t for t in tracks}

    # 构建 SongFileInfo 列表
    file_infos = []
    for track in tracks:
        if track.file and track.file.media_mid:
            file_infos.append(SongFileInfo(
                mid=track.mid,
                file_type=SongFileType.MP3_128,
                song_type=track.type,
                media_mid=track.file.media_mid
            ))

    # 获取播放链接
    url_map = {}
    if file_infos:
        try:
            urls_data = await api.song.get_song_urls(file_infos, credential=cred)
            if urls_data.data:
                for i, item in enumerate(urls_data.data):
                    if item.purl and i < len(file_infos):
                        url_map[file_infos[i].mid] = f"{DEFAULT_SIP}{item.purl}"
        except Exception as e:
            print(f"[bridge] 获取URL失败: {e}", file=sys.stderr)

    # 组装结果
    out = []
    for s in songs:
        track = track_map.get(s.mid)
        full_url = url_map.get(s.mid, "")
        out.append({
            "mid": s.mid,
            "title": track.title if track and hasattr(track, "title") else s.name,
            "artist": ", ".join(a.name for a in track.singer) if track and hasattr(track, "singer") else "",
            "cover": f"https://y.qq.com/music/photo_new/T002R300x300M000{s.album.mid}.jpg"
                     if hasattr(s, "album") and s.album and s.album.mid else "",
            "duration": track.interval * 1000 if track and hasattr(track, "interval") else 0,
            "url": full_url,
        })
    return out

async def get_song_url(mid: str):
    cred = load_cred()
    api = Client(credential=cred)

    # 获取歌曲详情
    detail = await api.song.query_song([mid])
    if not detail.tracks:
        return {}
    track = detail.tracks[0]

    # 构建 SongFileInfo
    if not track.file or not track.file.media_mid:
        return {}

    file_info = SongFileInfo(
        mid=track.mid,
        file_type=SongFileType.MP3_128,
        song_type=track.type,
        media_mid=track.file.media_mid
    )

    # 获取播放链接
    try:
        urls_data = await api.song.get_song_urls([file_info], credential=cred)
        if urls_data.data and urls_data.data[0].purl:
            return {mid: f"{DEFAULT_SIP}{urls_data.data[0].purl}"}
    except Exception as e:
        print(f"[bridge] 获取URL失败: {e}", file=sys.stderr)

    return {}

async def get_fav_songs(limit: int = 20):
    """获取用户收藏的歌曲"""
    cred = load_cred()
    if not cred:
        return []
    api = Client(credential=cred)
    musicid = cred.musicid if cred else 0
    euin = str(musicid) if musicid else ""
    if not euin:
        return []
    try:
        result = await api.user.get_fav_song(euin, num=limit)
        songs = result.song[:limit] if hasattr(result, 'song') else []
        if not songs:
            return []
        mids = [s.mid for s in songs]
        detail = await api.song.query_song(mids)
        tracks = detail.tracks
        track_map = {t.mid: t for t in tracks}
        out = []
        for s in songs:
            track = track_map.get(s.mid)
            out.append({
                "mid": s.mid,
                "title": track.title if track and hasattr(track, "title") else s.name,
                "artist": ", ".join(a.name for a in track.singer) if track and hasattr(track, "singer") else "",
            })
        return out
    except Exception as e:
        print(f"[bridge] 获取收藏失败: {e}", file=sys.stderr)
        return []

# CLI 入口
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python qq_bridge.py <search|url|fav> [参数...]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "search" and len(sys.argv) >= 3:
        kw = sys.argv[2]
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        print(json.dumps(asyncio.run(search_songs(kw, limit)), ensure_ascii=False))

    elif cmd == "url" and len(sys.argv) >= 3:
        mid = sys.argv[2]
        print(json.dumps(asyncio.run(get_song_url(mid)), ensure_ascii=False))

    elif cmd == "fav":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
        print(json.dumps(asyncio.run(get_fav_songs(limit)), ensure_ascii=False))

    else:
        print("用法: python qq_bridge.py <search|url|fav> [参数...]")
        sys.exit(1)
