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

    # 按 mid 建索引，避免 tracks/songs 顺序不一致导致错配
    track_map = {t.mid: t for t in tracks}
    url_map = {}
    for i, u in enumerate(urls_data.data if hasattr(urls_data, 'data') else []):
        if i < len(tracks) and u.purl:
            url_map[tracks[i].mid] = f"{sip}{u.purl}"

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

async def get_fav_songs(limit: int = 20):
    """获取用户收藏的歌曲"""
    cred = load_cred()
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
        print(f"[bridge] get_fav_songs 失败: {e}", file=sys.stderr)
        return []

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

async def get_created_songlists():
    """获取用户自建歌单列表"""
    cred = load_cred()
    if not cred or not cred.musicid:
        return []
    api = Client(credential=cred)
    try:
        result = await api.user.get_created_songlist(cred.musicid)
        lists = result.list if hasattr(result, 'list') else []
        return [{"id": l.tid, "name": l.name, "count": l.song_count if hasattr(l, "song_count") else 0} for l in lists]
    except Exception as e:
        print(f"[bridge] get_created_songlists 失败: {e}", file=sys.stderr)
        return []

async def get_fav_songlists(euin: str = "", limit: int = 20):
    """获取用户收藏的歌单"""
    cred = load_cred()
    if not cred:
        return []
    api = Client(credential=cred)
    euin = euin or str(cred.musicid or "")
    if not euin:
        return []
    try:
        result = await api.user.get_fav_songlist(euin, num=limit)
        lists = result.list if hasattr(result, 'list') else []
        return [{"id": l.tid, "name": l.name, "count": l.song_count if hasattr(l, "song_count") else 0} for l in lists]
    except Exception as e:
        print(f"[bridge] get_fav_songlists 失败: {e}", file=sys.stderr)
        return []

async def get_playlist_songs(songlist_id: int, limit: int = 50):
    """获取歌单中的歌曲"""
    cred = load_cred()
    api = Client(credential=cred)
    try:
        result = await api.songlist.get_detail(songlist_id, num=limit)
        songs = result.song_list[:limit] if hasattr(result, 'song_list') else []
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
                "title": track.title if track and hasattr(track, "title") else s.name if hasattr(s, "name") else "",
                "artist": ", ".join(a.name for a in track.singer) if track and hasattr(track, "singer") else "",
            })
        return out
    except Exception as e:
        print(f"[bridge] get_playlist_songs 失败: {e}", file=sys.stderr)
        return []

async def get_daily_recommend(limit: int = 10):
    """获取 QQ 音乐每日推荐歌曲"""
    cred = load_cred()
    api = Client(credential=cred)
    try:
        result = await api.recommend.get_guess_recommend()
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
        print(f"[bridge] get_daily_recommend 失败: {e}", file=sys.stderr)
        return []

async def pull_all_taste(limit: int = 30):
    """一键拉取所有口味数据：收藏歌曲 + 自建歌单 + 收藏歌单 + 每日推荐"""
    result = {
        "fav_songs": [],
        "created_songlists": [],
        "fav_songlists": [],
        "all_playlist_songs": [],
        "daily_recommend": [],
    }

    # 收藏歌曲
    result["fav_songs"] = await get_fav_songs(limit)

    # 自建歌单 + 歌单内歌曲
    created = await get_created_songlists()
    result["created_songlists"] = created
    all_playlist_songs = []
    seen = set()
    for pl in created[:5]:
        songs = await get_playlist_songs(pl["id"], 30)
        for s in songs:
            key = s.get("mid", "")
            if key and key not in seen:
                seen.add(key)
                all_playlist_songs.append(s)
    result["all_playlist_songs"] = all_playlist_songs

    # 收藏歌单
    result["fav_songlists"] = await get_fav_songlists(limit=10)

    # 每日推荐
    result["daily_recommend"] = await get_daily_recommend(10)

    return result

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "search"
    if cmd == "search":
        kw = sys.argv[2] if len(sys.argv) > 2 else "周杰伦"
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        print(json.dumps(asyncio.run(search_songs(kw, limit)), ensure_ascii=False))
    elif cmd == "url":
        mids = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(asyncio.run(get_urls_by_mid(mids)), ensure_ascii=False))
    elif cmd == "fav_songs":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
        print(json.dumps(asyncio.run(get_fav_songs(limit)), ensure_ascii=False))
    elif cmd == "taste":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        print(json.dumps(asyncio.run(pull_all_taste(limit)), ensure_ascii=False))
    elif cmd == "daily":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        print(json.dumps(asyncio.run(get_daily_recommend(limit)), ensure_ascii=False))
