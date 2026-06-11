document.addEventListener('DOMContentLoaded', () => {
    // ================= 1. PWA 离线 Service Worker 注册 =================
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 注册就绪:', reg.scope))
            .catch(err => console.error('Service Worker 注册故障:', err));
    }

    // ================= 2. DOM 节点注册映射 =================
    const authScreen = document.getElementById('auth-screen');
    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    const mainApp = document.getElementById('main-app');
    const toRegisterBtn = document.getElementById('to-register-btn');
    const toLoginBtn = document.getElementById('to-login-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const scheduleToggleBtn = document.getElementById('schedule-toggle-btn');
    const schedulePanel = document.getElementById('schedule-panel');
    const closeScheduleBtn = document.getElementById('close-schedule-btn');
    const scheduleListContainer = document.getElementById('schedule-list');
    
    // 方案 A 互联专属节点
    const feishuBindZone = document.getElementById('feishu-bind-zone');
    const feishuConnectBtn = document.getElementById('feishu-connect-btn');

    // 交互组件节点
    const voiceTabs = document.querySelectorAll('.voice-tab');
    const recordBtn = document.getElementById('record-btn');
    const recordStatus = document.getElementById('record-status');
    const visualizer = document.getElementById('audio-visualizer');
    const chatBox = document.getElementById('chat-box');
    const audioPlayer = document.getElementById('dj-audio-player');
    const djInfoTitle = document.querySelector('#dj-info h2');
    const djInfoDesc = document.querySelector('#dj-info p');

    // 文本输入节点
    const textInput = document.getElementById('text-input');
    const textSendBtn = document.getElementById('text-send-btn');

    // 初始化默认声线为 温柔女声
    let currentVoice = 'gentle_female';
    let localToken = localStorage.getItem('dj_auth_token') || '';


    // 播放队列管理
    let playQueue = [];
    let currentQueueIndex = -1;
    let currentPlayingCard = null;

    // ================= 3. 会话校验与飞书 OAuth 成功回调检测 =================
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('bind') === 'success') {
        alert('🎉 账户互联成功！您的本地系统账号已与飞书 OpenID 完成安全数据库搭桥。');
        window.history.replaceState({}, document.title, window.location.pathname);
        
        authScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        setTimeout(() => {
            schedulePanel.classList.add('show');
            fetchFeishuSchedule();
        }, 500);
    } else if (localToken) {
        authScreen.style.display = 'none';
        mainApp.style.display = 'flex';
    }

    // ================= 4. 本地鉴权模块 =================
    toRegisterBtn.addEventListener('click', (e) => { e.preventDefault(); loginCard.style.display = 'none'; registerCard.style.display = 'block'; });
    toLoginBtn.addEventListener('click', (e) => { e.preventDefault(); registerCard.style.display = 'none'; loginCard.style.display = 'block'; });

    // 【本地注册持久化】
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;

        if (password !== confirm) { alert('⚠️ 两次输入的密码不一致，请核对。'); return; }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (response.status === 200 || result.code === 200) {
                alert('🎉 注册成功！请登录');
                toLoginBtn.click();
            } else {
                alert(`❌ 注册失败: ${result.message}`);
            }
        } catch (err) { alert('无法连接到本地注册中心服务。'); }
    });

    // 【本地登录：精准拦截 404 与 401】
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (response.status === 200 && result.code === 200) {
                localToken = result.data.token;
                localStorage.setItem('dj_auth_token', localToken);
                authScreen.style.opacity = '0';
                setTimeout(() => {
                    authScreen.style.display = 'none';
                    mainApp.style.display = 'flex';
                }, 300);
            } else if (response.status === 404 || result.code === 404) {
                alert(`🔍 账号核验提示：\n${result.message}`);
            } else if (response.status === 401 || result.code === 401) {
                alert(`🔒 密码错误提示：\n${result.message}`);
            } else {
                alert(`⚠️ 鉴权异常: ${result.message}`);
            }
        } catch (err) { alert('无法连接到本地鉴权服务器中心。'); }
    });

    // ================= 5. 云日程数据提取 =================
    const fetchFeishuSchedule = async () => {
        scheduleListContainer.innerHTML = '<div class="schedule-loading">✨ 正在核验飞书云端链路...</div>';
        feishuBindZone.style.display = 'none';
        scheduleListContainer.style.display = 'block';

        try {
            const response = await fetch('/api/schedule', {
                headers: { 'Authorization': `Bearer ${localToken}` }
            });
            const result = await response.json();

            if (response.status === 401 || result.code === 401) {
                scheduleListContainer.style.display = 'none';
                feishuBindZone.style.display = 'flex';
            } else if (result.code === 200 && Array.isArray(result.data)) {
                renderScheduleList(result.data);
            } else {
                scheduleListContainer.innerHTML = `<div class="schedule-loading">⚠️ 获取故障: ${result.message}</div>`;
            }
        } catch (error) {
            scheduleListContainer.innerHTML = `<div class="schedule-loading" style="color:var(--accent)">❌ 链通断开: ${error.message}</div>`;
        }
    };

    feishuConnectBtn.addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/feishu/auth-url?token=${encodeURIComponent(localToken)}`);
            const result = await response.json();
            if (result.code === 200 && result.data.url) {
                window.location.href = result.data.url;
            } else { alert(`无法建立握手 URL: ${result.message}`); }
        } catch (err) { alert('获取飞书授权中枢失败。'); }
    });

    const renderScheduleList = (list) => {
        scheduleListContainer.innerHTML = '';
        if (list.length === 0) {
            scheduleListContainer.innerHTML = '<div class="schedule-loading">您今日的飞书日程空空如也</div>';
            return;
        }
        list.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `schedule-item ${item.active ? 'active' : ''}`;
            itemDiv.innerHTML = `
                <div class="schedule-time">${item.time}</div>
                <div class="schedule-content">${item.content}</div>
            `;
            scheduleListContainer.appendChild(itemDiv);
        });
    };

    scheduleToggleBtn.addEventListener('click', () => { schedulePanel.classList.add('show'); fetchFeishuSchedule(); });
    closeScheduleBtn.addEventListener('click', () => schedulePanel.classList.remove('show'));

    // ================= 6. 声线切换 =================
    voiceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            voiceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentVoice = tab.getAttribute('data-voice');
        });
    });

    // ================= 7. 通用 UI 工具函数 =================
    const resetUI = () => {
        djInfoTitle.textContent = '等待为您服务...';
        djInfoDesc.textContent = '点击下方录音按钮开始对话';
        recordStatus.textContent = '按住或点击开始说话';
        recordBtn.classList.remove('recording');
        visualizer.classList.remove('active');
        textSendBtn.disabled = false;
        textInput.disabled = false;
        textInput.focus();
    };

    const appendUserMessage = (text) => {
        const uDiv = document.createElement('div');
        uDiv.className = 'message user-message';
        uDiv.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
        chatBox.appendChild(uDiv);
        scrollToBottom();
        return uDiv;
    };

    const appendSystemMessage = (html) => {
        const sDiv = document.createElement('div');
        sDiv.className = 'message system-message';
        sDiv.innerHTML = `<div class="message-content">${html}</div>`;
        chatBox.appendChild(sDiv);
        scrollToBottom();
        return sDiv;
    };

    const scrollToBottom = () => {
        const container = chatBox.parentElement;
        if (container) container.scrollTop = container.scrollHeight;
    };

    const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    // ================= 8. 语音录制（直接用 diagnostic_plus.html 的实现，16kHz WAV，零依赖） =================
    let _recState = {
        audioContext: null,
        mediaStream: null,
        audioProcessor: null,
        isRecording: false,
        isStarting: false,
        audioBuffer: [],
        sampleRate: 16000,
        startTs: 0,
    };

    const _recSetUI = (recording) => {
        if (recording) {
            recordBtn.classList.add('recording');
            visualizer.classList.add('active');
            recordStatus.textContent = '正在录音，点击停止';
        } else {
            recordBtn.classList.remove('recording');
            visualizer.classList.remove('active');
            recordStatus.textContent = '按住或点击开始说话';
        }
    };

    const _recCleanup = () => {
        try { if (_recState.mediaStream) _recState.mediaStream.getTracks().forEach(t => t.stop()); } catch(e){}
        try { if (_recState.audioProcessor) _recState.audioProcessor.disconnect(); } catch(e){}
        try { if (_recState.audioContext && _recState.audioContext.state !== 'closed') _recState.audioContext.close(); } catch(e){}
        _recState = {
            audioContext: null,
            mediaStream: null,
            audioProcessor: null,
            isRecording: false,
            isStarting: false,
            audioBuffer: [],
            sampleRate: 16000,
            startTs: 0,
        };
    };

    // Float32 PCM 样本 → WAV Blob 编码器 (强制16kHz, mono, 16-bit PCM)
    // 如果浏览器 AudioContext 采样率不是 16000Hz，先线性重采样，保证 ASR 服务收到正确的音频时长
    const _resampleLinear = (samples, fromSR, toSR = 16000) => {
        if (fromSR === toSR) return samples;
        const ratio = fromSR / toSR;
        const newLen = Math.floor(samples.length / ratio);
        const result = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
            const srcIdx = i * ratio;
            const i0 = Math.floor(srcIdx);
            const frac = srcIdx - i0;
            const s0 = samples[Math.min(i0, samples.length - 1)];
            const s1 = samples[Math.min(i0 + 1, samples.length - 1)];
            result[i] = s0 * (1 - frac) + s1 * frac;
        }
        return result;
    };

    // —— diagnostic_plus.html 同款 WAV 编码器 (44B RIFF header + 16-bit PCM) ——
    const _wavEncodeFromFloat32 = (samples, sampleRate) => {
        const wavBuffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(wavBuffer);

        const writeStr = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, samples.length * 2, true);

        let offsetWav = 44;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offsetWav, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offsetWav += 2;
        }

        return new Blob([view], { type: 'audio/wav' });
    };

    const _recSendASR = (blob) => {
        if (!blob || blob.size === 0) {
            recordStatus.textContent = '没有录到声音，请重试';
            setTimeout(() => _recSetUI(false), 500);
            return;
        }

        // —— 诊断模式：同一段音频同时发两条路径，对比结果 ——
        console.log('[录音] 生成 WAV:', blob.size, 'bytes, sampleRate: 16000');
        console.log('[录音] 同时发往 :5000 (直连ASR) 和 /api/asr (经过Node后端) 对比结果');

        recordStatus.textContent = '语音识别中...';

        const formDataDirect = new FormData();
        formDataDirect.append('file', blob, 'user_voice_direct.wav');

        const formDataBackend = new FormData();
        formDataBackend.append('audio', blob, 'user_voice.wav');

        // 路径1：直连 ASR 服务 (和 diagnostic_plus.html 完全一致)
        // —— 关键修复：优先用 data.results.google.text（经过独立标点恢复）
        //    而不是 data.text / whisper.text（Whisper 自带标点，会出问题）
        const p1 = fetch('http://localhost:5000/recognize/file', {
            method: 'POST',
            body: formDataDirect,
        }).then(r => r.json()).then(data => {
            console.log('[ASR-DIRECT :5000] 原始响应:', data);
            // 提取策略与 diagnostic_plus.html 保持一致
            let txt = '';
            if (data && data.results && data.results.google && data.results.google.status === 'success' && data.results.google.text) {
                txt = data.results.google.text;  // 优先：Google 识别 + 标点后处理
            } else if (data && data.text) {
                txt = data.text;  // 回退：顶层 text 字段
            } else if (data && data.results && data.results.whisper && data.results.whisper.text) {
                txt = data.results.whisper.text;  // 回退：Whisper 直接输出
            }
            return txt;
        }).catch(e => {
            console.error('[ASR-DIRECT :5000] 失败:', e);
            return '';
        });

        // 路径2：经过 Node 后端 /api/asr
        // 后端已经统一提取策略，这里只需要读 data.data.text
        const p2 = fetch('/api/asr', {
            method: 'POST',
            body: formDataBackend,
            headers: { 'Authorization': `Bearer ${localToken}` }
        }).then(r => r.json()).then(data => {
            console.log('[ASR-VIA-NODE /api/asr] 原始响应:', data);
            if (data.code === 200 && data.data && data.data.text) return data.data.text;
            return '';
        }).catch(e => {
            console.error('[ASR-VIA-NODE /api/asr] 失败:', e);
            return '';
        });

        Promise.all([p1, p2]).then(([directText, backendText]) => {
            console.log('%c=== ASR 两条路径结果对比 ===', 'color: #ff9800; font-weight: bold');
            console.log('%c直连 :5000        →', 'color: #2e7d32', directText || '(空)');
            console.log('%c经 Node /api/asr   →', 'color: #1565c0', backendText || '(空)');
            if (directText && backendText && directText !== backendText) {
                console.log('%c⚠ 两条路径结果不一致！问题在 Node 后端转发', 'color: #d32f2f; font-weight: bold');
            } else if (directText) {
                console.log('%c✓ 直连ASR正常，识别有效', 'color: #2e7d32; font-weight: bold');
            }

            // 优先用直连结果（保证识别质量），后端路径也正常时用后端
            const useText = directText || backendText;
            if (useText) {
                textInput.value = useText;
                textInput.focus();
                recordStatus.textContent = '识别完成，请点击发送';
            } else {
                recordStatus.textContent = '未能识别出语音内容，请试着重新说一次';
            }
        });
    };

    // —— diagnostic_plus.html 同款 startRecording ——
    const _recStart = () => {
        // 防止 getUserMedia 异步期间用户反复点击导致并发启动
        if (_recState.isRecording || _recState.isStarting) {
            console.log('[录音] 已在录音或正在启动，忽略重复点击');
            return;
        }
        _recState.isStarting = true;
        console.log('[录音] 开始启动录音，等待麦克风权限...');

        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 16000,
            }
        }).then((stream) => {
            _recState.mediaStream = stream;

            const AC = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AC({ sampleRate: 16000 });
            _recState.audioContext = audioContext;

            const actualSR = audioContext.sampleRate;
            console.log('[录音] AudioContext 实际采样率:', actualSR,
                       actualSR === 16000 ? '(OK, 符合要求)' : '(浏览器未按16kHz运行，将自动重采样到16kHz)');

            const source = audioContext.createMediaStreamSource(stream);

            _recState.audioBuffer = [];
            const bufferSize = 4096;
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            _recState.audioProcessor = processor;

            // —— 与 diagnostic_plus.html 一致：无条件采集所有 onaudioprocess 回调 ——
            processor.onaudioprocess = function(e) {
                const data = e.inputBuffer.getChannelData(0);
                const copy = new Float32Array(data);
                _recState.audioBuffer.push(copy);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            _recState.isStarting = false;
            _recState.isRecording = true;
            _recState.startTs = Date.now();
            _recSetUI(true);
            console.log('[录音] 开始录音 (16kHz WAV)');
        }).catch((err) => {
            console.error('[录音] 启动失败:', err);
            _recState.isStarting = false;
            alert('无法使用麦克风：' + (err.message || err));
            _recCleanup();
            _recSetUI(false);
        });
    };

    // —— diagnostic_plus.html 同款 stopRecording ——
    // 关键点：先设 isRecording=false + 先清资源，再做重采样和编码，
    //         保证点击停止按钮后，麦克风立即停止，用户不会觉得"没反应"
    const _recStop = () => {
        if (!_recState.isRecording) return;

        console.log('[录音] 用户点击停止，采集到的音频块:', _recState.audioBuffer.length);

        // 1. 立即停止录音状态，防止 onaudioprocess 继续 push（虽然我们没加状态判断）
        _recState.isRecording = false;

        // 2. 先记录需要的数据（在清资源之前）
        const actualSR = _recState.audioContext ? _recState.audioContext.sampleRate : 16000;
        const audioBufferSnapshot = _recState.audioBuffer.slice();  // 复制引用，避免后续被清理影响
        const totalLength = audioBufferSnapshot.reduce((sum, b) => sum + b.length, 0);

        console.log('[录音] 浏览器采样率:', actualSR, ', 总样本数:', totalLength,
                    ', 实际时长约', (totalLength / actualSR).toFixed(2), '秒');

        // 3. 立即清理资源 —— 麦克风停止，用户感知到"已经停止"
        _recCleanup();
        _recSetUI(false);

        // 4. 录音太短：提前返回
        if (totalLength < (actualSR * 0.3)) {
            recordStatus.textContent = '录音太短，请说长一点';
            setTimeout(() => _recSetUI(false), 500);
            return;
        }

        // 5. 异步做重采样和 WAV 编码（放到下一个事件循环，避免阻塞 UI）
        setTimeout(() => {
            try {
                // 合并所有 Float32Array
                let merged = new Float32Array(totalLength);
                let offset = 0;
                for (const chunk of audioBufferSnapshot) {
                    merged.set(chunk, offset);
                    offset += chunk.length;
                }

                // —— 如果浏览器 SR 不是 16kHz，线性重采样到 16kHz ——
                if (actualSR !== 16000) {
                    console.log('[录音] 浏览器采样率', actualSR + 'Hz，重采样到 16000Hz');
                    merged = _resampleLinear(merged, actualSR, 16000);
                }

                // WAV 编码：sampleRate 固定 16000
                const wavBlob = _wavEncodeFromFloat32(merged, 16000);
                console.log('[录音] 生成 WAV:', wavBlob.size, 'bytes, 最终 sampleRate: 16000, 约',
                           (merged.length / 16000).toFixed(2), '秒');

                _recSendASR(wavBlob);
            } catch (e) {
                console.error('[录音] 音频处理失败:', e);
                recordStatus.textContent = '音频处理失败，请重试';
            }
        }, 0);
    };

    recordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_recState.isRecording) {
            _recStop();
        } else {
            _recStart();
        }
    });

    // ================= 9. 文本输入 + /api/dispatch SSE 对接 =================
    // 打字机效果
    let _typewriterQueue = '';
    let _typewriterTimer = null;
    const TYPE_SPEED = 35; // ms/字

    const _startTypewriter = (contentDiv) => {
        if (_typewriterTimer) return;
        _typewriterTimer = setInterval(() => {
            if (_typewriterQueue.length === 0) {
                clearInterval(_typewriterTimer);
                _typewriterTimer = null;
                return;
            }
            contentDiv.textContent += _typewriterQueue[0];
            _typewriterQueue = _typewriterQueue.slice(1);
            scrollToBottom();
        }, TYPE_SPEED);
    };

    const _flushTypewriter = (contentDiv) => {
        if (_typewriterQueue) {
            contentDiv.textContent += _typewriterQueue;
            _typewriterQueue = '';
        }
        if (_typewriterTimer) {
            clearInterval(_typewriterTimer);
            _typewriterTimer = null;
        }
        scrollToBottom();
    };

    const sendTextDispatch = async (text, silent = false) => {
        textSendBtn.disabled = true;
        textInput.disabled = true;
        recordStatus.textContent = 'AI 思考中...';

        if (!silent) {
            appendUserMessage(text);
        }
        _lastUserMessage = silent ? _lastUserMessage : text;

        // 静默请求不创建聊天气泡
        const sDiv = document.createElement('div');
        sDiv.className = 'message system-message';
        if (silent) sDiv.dataset.silent = 'true';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = '';
        sDiv.appendChild(contentDiv);
        if (!silent) {
            chatBox.appendChild(sDiv);
            scrollToBottom();
        }

        let buffer = '';
        let currentEvent = null;

        try {
            const response = await fetch('/api/dispatch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localToken}`
                },
                body: JSON.stringify({ message: text, voice: currentVoice })
            });

            if (!response.body) {
                throw new Error('响应体不可读');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保留未完整的一行

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('event:')) {
                        currentEvent = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        const data = line.slice(5).trim();
                        if (currentEvent === 'chunk') {
                            _typewriterQueue += data;
                            _startTypewriter(contentDiv);
                            recordStatus.textContent = 'DJ 正在播报...';
                        } else if (currentEvent === 'status') {
                            recordStatus.textContent = data;
                        } else if (currentEvent === 'tts_ready') {
                            try {
                                const tts = JSON.parse(data);
                                if (tts.text && sDiv) {
                                    const ttsDiv = document.createElement('div');
                                    ttsDiv.className = 'tts-card';
                                    ttsDiv.textContent = tts.text;
                                    sDiv.appendChild(ttsDiv);
                                    scrollToBottom();
                                }
                                if (tts.url) playAudio(tts.url, tts.text || 'DJ 播报');
                            } catch {}
                        } else if (currentEvent === 'done') {
                            _flushTypewriter(contentDiv);
                            handleDoneEvent(data, sDiv);
                        }
                        currentEvent = null;
                    }
                }
            }

            // 处理 buffer 中剩余内容
            if (buffer.trim()) {
                const line = buffer.trim();
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const data = line.slice(5).trim();
                    if (currentEvent === 'chunk') {
                        _typewriterQueue += data;
                        _startTypewriter(contentDiv);
                    } else if (currentEvent === 'tts_ready') {
                        try { const tts = JSON.parse(data); if (tts.url) playAudio(tts.url, tts.text || 'DJ 播报'); } catch {}
                    } else if (currentEvent === 'status') {
                        recordStatus.textContent = data;
                    } else if (currentEvent === 'done') {
                        _flushTypewriter(contentDiv);
                        handleDoneEvent(data, sDiv);
                    }
                }
            }
        } catch (err) {
            contentDiv.textContent = '请求失败，请稍后重试。';
            console.error('dispatch error:', err);
            resetUI();
        }
        // 恢复输入，但不重置播放器（TTS/歌曲可能正在播放）
        textSendBtn.disabled = false;
        textInput.disabled = false;
        textInput.focus();
    };

    const handleDoneEvent = (data, sDiv) => {
        let payload;
        try {
            payload = JSON.parse(data);
        } catch (e) {
            console.error('done event JSON parse error:', e);
            return;
        }

        const type = payload.type;
        if (type === 'command') {
            // 指令匹配：执行对应操作
            if (payload.action === 'next') playNext();
            else if (payload.action === 'prev') playPrev();
            return;
        }

        if (type === 'error') {
            const errDiv = document.createElement('div');
            errDiv.className = 'error-toast';
            errDiv.textContent = payload.message || '处理失败';
            sDiv.appendChild(errDiv);
            scrollToBottom();
            return;
        }

        if (type === 'search') {
            const list = payload.results || [];
            const listContainer = document.createElement('div');
            listContainer.className = 'search-list';
            list.forEach(song => {
                listContainer.innerHTML += renderSongCard(song, true);
            });
            sDiv.appendChild(listContainer);
            scrollToBottom();
            return;
        }

        if (type === 'plan') {
            const items = payload.items || [];
            const isSilent = sDiv.dataset.silent === 'true';
            if (isSilent) {
                playPlanItems(items, null);
                return;
            }
            if (!sDiv.parentNode) {
                sDiv.style.padding = '0';
                sDiv.style.background = 'none';
                sDiv.style.border = 'none';
                chatBox.appendChild(sDiv);
            }
            playPlanItems(items, sDiv);
            return;
        }
    };

    // ================= 10. PlanResponse items[] 渲染与播放队列 =================
    let _lastUserMessage = '';

    const playPlanItems = async (items, container) => {
        if (!items.length) return;

        const isSilent = container === null;
        const isRecommend = /推荐/.test(_lastUserMessage);

        if (isSilent) {
            // 静默模式：只播不渲染，把歌曲加入队列
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'tts' && item.ttsAudioUrl) {
                    await playAudio(item.ttsAudioUrl, item.text || 'DJ 播报');
                } else if (item.type === 'song' && item.audioUrl) {
                    addToPlayQueue('song', item.audioUrl, `🎵 《${item.title}》 - ${item.artist}`,
                        (i > 0 && items[i-1].type === 'tts' && items[i-1].ttsAudioUrl) ? items[i-1].ttsAudioUrl : '',
                        (i > 0 && items[i-1].type === 'tts') ? (items[i-1].text || '') : '');
                    currentQueueIndex = playQueue.length - 1;
                    fetch('/api/player/report-play', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: item.title, artist: item.artist, songId: item.songId })
                    }).catch(() => {});
                    await playAudio(item.audioUrl, `🎵 《${item.title}》 - ${item.artist}`);
                }
            }
        } else if (isRecommend) {
            // ── 推荐模式：一次性渲染全部卡片 ──
            let pendingTtsText = '';
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'tts') {
                    pendingTtsText = item.text || '';
                } else if (item.type === 'song') {
                    if (pendingTtsText) {
                        const ttsDiv = document.createElement('div');
                        ttsDiv.className = 'tts-card';
                        ttsDiv.textContent = pendingTtsText;
                        container.appendChild(ttsDiv);
                        pendingTtsText = '';
                    }
                    const d = document.createElement('div');
                    d.innerHTML = renderSongCard(item);
                    container.appendChild(d);
                }
            }
            scrollToBottom();
        } else {
            // ── 电台模式：逐首渲染+播放 ──
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'tts') {
                    const ttsDiv = document.createElement('div');
                    ttsDiv.className = 'tts-card';
                    ttsDiv.textContent = item.text || '';
                    container.appendChild(ttsDiv);
                    scrollToBottom();
                    if (item.ttsAudioUrl) {
                        await playAudio(item.ttsAudioUrl, item.text || 'DJ 播报');
                    }
                } else if (item.type === 'song') {
                    const d = document.createElement('div');
                    d.innerHTML = renderSongCard(item);
                    container.appendChild(d);
                    scrollToBottom();
                    if (item.audioUrl) {
                        addToPlayQueue('song', item.audioUrl, `🎵 《${item.title}》 - ${item.artist}`,
                            (i > 0 && items[i-1].type === 'tts' && items[i-1].ttsAudioUrl) ? items[i-1].ttsAudioUrl : '',
                            (i > 0 && items[i-1].type === 'tts') ? (items[i-1].text || '') : '');
                        currentQueueIndex = playQueue.length - 1;
                        resetAllCardButtons();
                        currentPlayingCard = d.querySelector('.song-card');
                        if (currentPlayingCard) {
                            const btn = currentPlayingCard.querySelector('.song-play-btn');
                            if (btn) btn.textContent = '⏸';
                        }
                        fetch('/api/player/report-play', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: item.title, artist: item.artist, songId: item.songId })
                        }).catch(() => {});
                        await playAudio(item.audioUrl, `🎵 《${item.title}》 - ${item.artist}`);
                    }
                }
            }
        }

        // 播完预取下一批
        if (playQueue.length - currentQueueIndex <= 2) {
            sendTextDispatch('继续', true);
        }
        resetUI();
    };

    const playAudio = (url, desc) => {
        return new Promise((resolve) => {
            if (audioPlayer.src !== url) audioPlayer.src = url;
            audioPlayer.play().then(() => {
                djInfoTitle.textContent = '正在播放';
                djInfoDesc.textContent = desc;
                recordStatus.textContent = '播放中...';
                if (currentPlayingCard) {
                    const btn = currentPlayingCard.querySelector('.song-play-btn');
                    if (btn) btn.textContent = '⏸';
                }
            }).catch(() => {});
            audioPlayer.onended = resolve;
            audioPlayer.onerror = resolve;
        });
    };

    const renderSongCard = (song, selectable = false) => {
        const title = escapeHtml(song.title || '');
        const artist = escapeHtml(song.artist || '');
        const reason = escapeHtml(song.reason || '');
        const cover = song.coverUrl ? `<img src="${escapeHtml(song.coverUrl)}" alt="cover">` : `<div class="cover-placeholder">🎵</div>`;
        const reasonHtml = reason ? `<div class="reason">💡 ${reason}</div>` : '';
        const playable = !!song.audioUrl;
        const audioUrlEscaped = playable ? escapeHtml(song.audioUrl) : '';
        const unplayable = !playable ? `<div class="unplayable">无法播放</div>` : '';

        const playerControls = playable ? `
            <div class="song-player">
                <div class="song-progress">
                    <div class="song-progress-bar">
                        <div class="song-progress-fill"></div>
                    </div>
                    <div class="song-time">
                        <span class="song-current-time">0:00</span>
                        <span class="song-duration">0:00</span>
                    </div>
                </div>
                <div class="song-nav">
                    <button class="song-prev-btn" title="上一首">⏮</button>
                    <button class="song-play-btn" data-url="${audioUrlEscaped}" title="播放">▶</button>
                    <button class="song-next-btn" title="下一首">⏭</button>
                </div>
            </div>
        ` : '';

        return `
            <div class="song-card" data-audio-url="${audioUrlEscaped}">
                <div class="song-header">
                    <div class="cover">${cover}</div>
                    <div class="info">
                        <div class="title">${title}</div>
                        ${artist ? `<div class="artist">${artist}</div>` : ''}
                        ${reasonHtml}
                        ${unplayable}
                    </div>
                </div>
                ${playerControls}
            </div>
        `;
    };

    // 添加歌曲到播放队列（含串词 TTS）
    const addToPlayQueue = (type, url, desc, ttsUrl, ttsText) => {
        playQueue.push({ type, url, desc, ttsUrl, ttsText });
    };

    // 播放队列指定位置（只负责切歌+按钮，不负责渲染）
    const playQueueItem = async (index) => {
        if (index < 0 || index >= playQueue.length) return;
        resetAllCardButtons();
        currentQueueIndex = index;
        const item = playQueue[index];

        if (item.ttsUrl) {
            await new Promise((resolve) => {
                audioPlayer.src = item.ttsUrl;
                audioPlayer.play().catch(() => {});
                audioPlayer.onended = resolve;
                audioPlayer.onerror = resolve;
            });
        }
        audioPlayer.src = item.url;
        audioPlayer.play().then(() => {
            djInfoTitle.textContent = '正在播放';
            djInfoDesc.textContent = item.desc;
            recordStatus.textContent = '播放中...';
        }).catch(() => {});
    };

    // 全局重置：所有卡片按钮变 ▶
    const resetAllCardButtons = () => {
        document.querySelectorAll('.song-play-btn').forEach(btn => { btn.textContent = '▶'; });
    };

    const playPrev = () => { if (currentQueueIndex > 0) playQueueItem(currentQueueIndex - 1); };
    const playNext = () => {
        if (currentQueueIndex < playQueue.length - 1) {
            playQueueItem(currentQueueIndex + 1);
        } else {
            audioPlayer.pause();
            resetAllCardButtons();
            recordStatus.textContent = '正在为您准备...';
            sendTextDispatch('继续', true);
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const updateProgress = () => {
        if (!currentPlayingCard || audioPlayer.duration <= 0) return;
        const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        const fill = currentPlayingCard.querySelector('.song-progress-fill');
        const cur = currentPlayingCard.querySelector('.song-current-time');
        if (fill) fill.style.width = `${pct}%`;
        if (cur) cur.textContent = formatTime(audioPlayer.currentTime);
    };

    // 事件委托：歌曲卡片内的播放/上一首/下一首/进度条
    chatBox.addEventListener('click', (e) => {
        // 进度条拖拽
        const progressBar = e.target.closest('.song-progress-bar');
        if (progressBar && audioPlayer.duration > 0) {
            const rect = progressBar.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = pct * audioPlayer.duration;
            return;
        }
        // 播放按钮
        const playBtn = e.target.closest('.song-play-btn');
        if (playBtn) {
            const url = playBtn.getAttribute('data-url');
            if (url) {
                const card = playBtn.closest('.song-card');
                currentPlayingCard = card;
                // 如果正在播同一首歌，就暂停/继续
                if (audioPlayer.src.includes(url) && !audioPlayer.paused) {
                    audioPlayer.pause();
                    playBtn.textContent = '▶';
                } else if (audioPlayer.src.includes(url) && audioPlayer.paused) {
                    audioPlayer.play().then(() => { playBtn.textContent = '⏸'; }).catch(() => {});
                } else {
                    audioPlayer.src = url;
                    audioPlayer.play().then(() => {
                        playBtn.textContent = '⏸';
                        djInfoTitle.textContent = '正在播放';
                        recordStatus.textContent = '播放中...';
                    }).catch(() => {});
                }
                // 上报播放记录
                const titleEl = card?.querySelector('.title');
                const artistEl = card?.querySelector('.artist');
                if (titleEl && !audioPlayer.src.includes(url)) {
                    fetch('/api/player/report-play', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: titleEl.textContent, artist: artistEl?.textContent || '' })
                    }).catch(() => {});
                }
            }
            return;
        }
        const prevBtn = e.target.closest('.song-prev-btn');
        if (prevBtn) { playPrev(); return; }
        const nextBtn = e.target.closest('.song-next-btn');
        if (nextBtn) { playNext(); return; }
    });

    // 音频进度更新
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadedmetadata', () => {
        if (!currentPlayingCard) return;
        const el = currentPlayingCard.querySelector('.song-duration');
        if (el) el.textContent = formatTime(audioPlayer.duration);
    });
    audioPlayer.addEventListener('ended', () => {
        if (currentPlayingCard) {
            const fill = currentPlayingCard.querySelector('.song-progress-fill');
            const cur = currentPlayingCard.querySelector('.song-current-time');
            if (fill) fill.style.width = '0%';
            if (cur) cur.textContent = '0:00';
        }
    });

    // 文本输入事件绑定
    textSendBtn.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (!text) return;
        textInput.value = '';
        sendTextDispatch(text);
        textInput.focus();
    });

    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textSendBtn.click();
        }
    });

    // 页面加载完成后自动聚焦输入框
    setTimeout(() => textInput.focus(), 500);
});
