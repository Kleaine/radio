const fs = require("fs");
const sr = 44100, d = 8, n = sr * d;
const b = Buffer.alloc(44 + n * 2);
b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8);
b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write("data", 36); b.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const t = i / sr, e = 1 - t / d;
  const v = Math.sin(2 * Math.PI * 330 * e * e * t) * 0.1 * e
          + Math.sin(2 * Math.PI * 440 * t) * 0.05 * e;
  b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
}
fs.writeFileSync(__dirname + "/music/demo.wav", b);
console.log("DONE");
