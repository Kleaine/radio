const fs = require("fs");
const sr = 44100, dur = 5, samples = sr * dur;
const buf = Buffer.alloc(44 + samples * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + samples * 2, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / sr;
  const v = Math.sin(2 * Math.PI * 440 * t) * 0.3 * (1 - t / dur);
  buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
fs.writeFileSync(__dirname + "/music/demo.wav", buf);
console.log("DONE:", __dirname + "/music/demo.wav");
