// routes/player.routes.ts — 播放器控制路由
// 播放/暂停/下一首/上一首/随机/循环

import { Router, Request, Response } from "express";

export const playerRoutes = Router();

// 播放器状态（内存存储，单用户模式）
interface PlayerState {
  status: "playing" | "paused" | "stopped";
  currentIndex: number;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  playlist: Array<{
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
  }>;
  updatedAt: string;
}

const defaultState: PlayerState = {
  status: "stopped",
  currentIndex: 0,
  shuffle: false,
  repeat: "off",
  playlist: [],
  updatedAt: new Date().toISOString(),
};

let playerState: PlayerState = { ...defaultState };

// ── GET /api/player/status ──
playerRoutes.get("/status", (_req: Request, res: Response) => {
  res.success(playerState);
});

// ── POST /api/player/play ──
playerRoutes.post("/play", (_req: Request, res: Response) => {
  playerState.status = "playing";
  playerState.updatedAt = new Date().toISOString();
  res.success(playerState, "开始播放");
});

// ── POST /api/player/pause ──
playerRoutes.post("/pause", (_req: Request, res: Response) => {
  playerState.status = "paused";
  playerState.updatedAt = new Date().toISOString();
  res.success(playerState, "已暂停");
});

// ── POST /api/player/next ──
playerRoutes.post("/next", (_req: Request, res: Response) => {
  if (playerState.playlist.length === 0) {
    res.fail(400, "播放列表为空");
    return;
  }

  if (playerState.shuffle) {
    playerState.currentIndex = Math.floor(Math.random() * playerState.playlist.length);
  } else {
    playerState.currentIndex = (playerState.currentIndex + 1) % playerState.playlist.length;
  }

  playerState.status = "playing";
  playerState.updatedAt = new Date().toISOString();
  res.success(playerState, "已切换到下一首");
});

// ── POST /api/player/prev ──
playerRoutes.post("/prev", (_req: Request, res: Response) => {
  if (playerState.playlist.length === 0) {
    res.fail(400, "播放列表为空");
    return;
  }

  if (playerState.shuffle) {
    playerState.currentIndex = Math.floor(Math.random() * playerState.playlist.length);
  } else {
    playerState.currentIndex = (playerState.currentIndex - 1 + playerState.playlist.length) % playerState.playlist.length;
  }

  playerState.status = "playing";
  playerState.updatedAt = new Date().toISOString();
  res.success(playerState, "已切换到上一首");
});

// ── POST /api/player/shuffle ──
playerRoutes.post("/shuffle", (_req: Request, res: Response) => {
  playerState.shuffle = !playerState.shuffle;
  playerState.updatedAt = new Date().toISOString();
  res.success(playerState, playerState.shuffle ? "已开启随机播放" : "已关闭随机播放");
});

// ── POST /api/player/repeat ──
playerRoutes.post("/repeat", (_req: Request, res: Response) => {
  const modes: Array<"off" | "one" | "all"> = ["off", "one", "all"];
  const currentIdx = modes.indexOf(playerState.repeat);
  playerState.repeat = modes[(currentIdx + 1) % modes.length];
  playerState.updatedAt = new Date().toISOString();

  const modeNames = { off: "关闭循环", one: "单曲循环", all: "列表循环" };
  res.success(playerState, `已切换为${modeNames[playerState.repeat]}`);
});

// ── POST /api/player/playlist ──
playerRoutes.post("/playlist", (req: Request, res: Response) => {
  const { items } = req.body;

  if (!Array.isArray(items)) {
    res.fail(400, "items 必须是数组");
    return;
  }

  playerState.playlist = items.map((item: any) => ({
    id: item.id || "",
    title: item.title || "",
    artist: item.artist || "",
    audioUrl: item.audioUrl || item.songUrl || "",
  }));

  playerState.currentIndex = 0;
  playerState.status = "playing";
  playerState.updatedAt = new Date().toISOString();

  res.success(playerState, "播放列表已更新");
});
