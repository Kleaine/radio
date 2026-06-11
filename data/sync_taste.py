"""一键同步 QQ 音乐口味数据到 user/qq_taste.json
用法: python data/sync_taste.py
需要先扫码登录: python data/qq_login.py
"""
import json, sys, os, asyncio

# 确保能找到 qq_bridge
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qq_bridge import get_my_playlists, get_playlist_songs, get_fav_songs

async def main():
    print("正在拉取 QQ 音乐歌单...")
    result = {"playlists": [], "favSongs": []}

    # 自建歌单
    try:
        playlists = await get_my_playlists()
        print(f"  找到 {len(playlists)} 个自建歌单")
        for pl in playlists[:5]:
            print(f"  正在读取歌单: {pl['name']} ({pl.get('count', 0)}首)")
            songs = await get_playlist_songs(pl["id"], 50)
            result["playlists"].append({"name": pl["name"], "songs": songs})
    except Exception as e:
        print(f"  歌单拉取失败: {e}")

    # 收藏歌曲
    try:
        favs = await get_fav_songs(50)
        print(f"  找到 {len(favs)} 首收藏歌曲")
        result["favSongs"] = favs
    except Exception as e:
        print(f"  收藏拉取失败: {e}")

    # 保存
    out_dir = os.path.join(os.path.dirname(__file__), "..", "user")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "qq_taste.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(pl["songs"]) for pl in result["playlists"]) + len(result["favSongs"])
    print(f"\n已保存 {total} 首歌的口味数据到 user/qq_taste.json")

if __name__ == "__main__":
    asyncio.run(main())
