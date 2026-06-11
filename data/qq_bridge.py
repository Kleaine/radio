"""QQ音乐桥接：搜索+播放链接（适配 qqmusic_api 0.5.x）

增加网络重试机制，解决 qimei 设备指纹请求偶尔 ConnectionResetError 的问题。
"""
import asyncio
import json
import os
import sys

# 强制 UTF-8 输出，避免 Windows GBK 乱码
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from qqmusic_api import Client, Credential
from qqmusic_api.modules.song import SongFileInfo, SongFileType

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
CRED_PATH = os.path.join(BRIDGE_DIR, "qq_credential.json")

# 默认 SIP 服务器
DEFAULT_SIP = "http://ws.stream.qqmusic.qq.com/"

# 最大重试次数
MAX_RETRIES = 3
RETRY_DELAY = 1.0


def load_cred():
    try:
        if not os.path.exists(CRED_PATH):
            return None
        with open(CRED_PATH, encoding="utf-8") as f:
            data = json.load(f)
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


async def with_retry(func, *args, **kwargs):
    """带重试的异步调用，处理网络不稳定问题"""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            # 仅对网络类错误重试，其他错误直接抛出
            if any(kw in err_str for kw in ["connection", "reset", "timeout", "timed out", "network", "500", "502", "503", "504"]):
                if attempt < MAX_RETRIES - 1:
                    print(f"[bridge] 网络错误(尝试 {attempt + 1}/{MAX_RETRIES}): {e}，{RETRY_DELAY}s 后重试", file=sys.stderr)
                    await asyncio.sleep(RETRY_DELAY)
                    continue
            raise
    if last_err:
        raise last_err


async def search_songs(keyword: str, limit: int = 5):
    cred = load_cred()

    async def do_search():
        api = Client(credential=cred)
        result = await api.search.search_by_type(keyword, num=limit)
        songs = result.song[:limit] if result.song else []
        if not songs:
            return []

        # 获取歌曲详情
        mids = [s.mid for s in songs if s and hasattr(s, "mid")]
        if not mids:
            return []
        detail = await api.song.query_song(mids)
        tracks = detail.tracks if hasattr(detail, "tracks") else []
        track_map = {t.mid: t for t in tracks if hasattr(t, "mid")}

        # 构建 SongFileInfo 列表（用于获取播放链接）
        file_infos = []
        for track in tracks:
            if hasattr(track, "file") and track.file and hasattr(track.file, "media_mid") and track.file.media_mid:
                file_infos.append(SongFileInfo(
                    mid=track.mid,
                    file_type=SongFileType.MP3_128,
                    song_type=track.type if hasattr(track, "type") else 0,
                    media_mid=track.file.media_mid,
                ))

        # 获取播放链接
        url_map = {}
        if file_infos:
            try:
                urls_data = await api.song.get_song_urls(file_infos, credential=cred)
                if urls_data and hasattr(urls_data, "data") and urls_data.data:
                    for i, item in enumerate(urls_data.data):
                        if hasattr(item, "purl") and item.purl and i < len(file_infos):
                            url_map[file_infos[i].mid] = f"{DEFAULT_SIP}{item.purl}"
            except Exception as e:
                print(f"[bridge] 获取URL失败 (不影响搜索): {e}", file=sys.stderr)

        # 组装结果
        out = []
        for s in songs:
            if not s or not hasattr(s, "mid"):
                continue
            track = track_map.get(s.mid)
            full_url = url_map.get(s.mid, "")
            title = ""
            artist = ""
            cover = ""
            duration = 0
            if track:
                title = getattr(track, "title", "") or getattr(s, "name", "")
                if hasattr(track, "singer"):
                    artist = ", ".join(a.name for a in track.singer if hasattr(a, "name"))
                if hasattr(track, "interval") and track.interval:
                    duration = int(track.interval) * 1000
            else:
                title = getattr(s, "name", "")
            if hasattr(s, "album") and s.album and hasattr(s.album, "mid") and s.album.mid:
                cover = f"https://y.qq.com/music/photo_new/T002R300x300M000{s.album.mid}.jpg"
            out.append({
                "mid": s.mid,
                "title": title,
                "artist": artist,
                "cover": cover,
                "duration": duration,
                "url": full_url,
            })
        return out

    try:
        return await with_retry(do_search)
    except Exception as e:
        print(f"[bridge] 搜索失败: {e}", file=sys.stderr)
        return []


async def get_song_url(mid: str):
    cred = load_cred()

    async def do_url():
        api = Client(credential=cred)
        detail = await api.song.query_song([mid])
        if not hasattr(detail, "tracks") or not detail.tracks:
            return {}
        track = detail.tracks[0]

        if not hasattr(track, "file") or not track.file or not hasattr(track.file, "media_mid") or not track.file.media_mid:
            return {}

        file_info = SongFileInfo(
            mid=track.mid,
            file_type=SongFileType.MP3_128,
            song_type=track.type if hasattr(track, "type") else 0,
            media_mid=track.file.media_mid,
        )

        try:
            urls_data = await api.song.get_song_urls([file_info], credential=cred)
            if urls_data and hasattr(urls_data, "data") and urls_data.data and urls_data.data[0].purl:
                return {mid: f"{DEFAULT_SIP}{urls_data.data[0].purl}"}
        except Exception as e:
            print(f"[bridge] 获取URL失败: {e}", file=sys.stderr)
        return {}

    try:
        return await with_retry(do_url)
    except Exception as e:
        print(f"[bridge] 获取播放链接失败: {e}", file=sys.stderr)
        return {}


async def get_fav_songs(limit: int = 20):
    cred = load_cred()
    if not cred:
        return []

    async def do_fav():
        api = Client(credential=cred)
        musicid = cred.musicid if cred and hasattr(cred, "musicid") else 0
        if not musicid:
            return []
        result = await api.user.get_fav_song(str(musicid), num=limit)
        songs = result.song[:limit] if hasattr(result, "song") and result.song else []
        if not songs:
            return []
        mids = [s.mid for s in songs if s and hasattr(s, "mid")]
        if not mids:
            return []
        detail = await api.song.query_song(mids)
        tracks = detail.tracks if hasattr(detail, "tracks") else []
        track_map = {t.mid: t for t in tracks if hasattr(t, "mid")}
        out = []
        for s in songs:
            if not s or not hasattr(s, "mid"):
                continue
            track = track_map.get(s.mid)
            title = ""
            artist = ""
            if track:
                title = getattr(track, "title", "") or getattr(s, "name", "")
                if hasattr(track, "singer"):
                    artist = ", ".join(a.name for a in track.singer if hasattr(a, "name"))
            else:
                title = getattr(s, "name", "")
            out.append({"mid": s.mid, "title": title, "artist": artist})
        return out

    try:
        return await with_retry(do_fav)
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
