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
    let mediaRecorder, audioChunks = [], isRecording = false;

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

    // ================= 8. 语音录制 + /api/chat（保留原有逻辑） =================
    const sendAudioToServer = async (blob) => {
        const formData = new FormData();
        formData.append('audio', blob, 'user_voice.webm');
        formData.append('voice_style', currentVoice);

        try {
            const response = await fetch('/api/chat', { 
                method: 'POST', 
                body: formData,
                headers: { 'Authorization': `Bearer ${localToken}` }
            });
            const result = await response.json();
            if (result.code === 200) {
                const { userText, replyText, audioUrl, recommendSong } = result.data;
                
                appendUserMessage(userText);
                
                const sDiv = document.createElement('div'); 
                sDiv.className = 'message system-message';
                let html = `<div class="message-content">${escapeHtml(replyText)}</div>`;
                if (recommendSong) {
                    html += renderSongCard(recommendSong);
                }
                sDiv.innerHTML = html;
                chatBox.appendChild(sDiv);
                scrollToBottom();
                
                if (audioUrl) {
                    audioPlayer.src = audioUrl;
                    audioPlayer.play()
                        .then(() => {
                            djInfoTitle.textContent = '为您播报中';
                            djInfoDesc.textContent = replyText;
                            recordStatus.textContent = 'DJ 正在播报歌曲介绍...';
                        })
                        .catch(() => resetUI());
                    
                    audioPlayer.onended = () => {
                        if (recommendSong && recommendSong.songUrl) {
                            audioPlayer.src = recommendSong.songUrl;
                            audioPlayer.play()
                                .then(() => {
                                    djInfoTitle.textContent = '正在播放歌曲';
                                    djInfoDesc.textContent = `🎵 《${recommendSong.title}》 - ${recommendSong.artist}`;
                                    recordStatus.textContent = '音乐播放中，享受这一刻...';
                                })
                                .catch(() => resetUI());
                            audioPlayer.onended = () => resetUI();
                        } else {
                            resetUI();
                        }
                    };
                } else if (recommendSong && recommendSong.songUrl) {
                    audioPlayer.src = recommendSong.songUrl;
                    audioPlayer.play()
                        .then(() => {
                            djInfoTitle.textContent = '正在播放歌曲';
                            djInfoDesc.textContent = `🎵 《${recommendSong.title}》 - ${recommendSong.artist}`;
                            recordStatus.textContent = '音乐播放中...';
                        })
                        .catch(() => resetUI());
                    audioPlayer.onended = () => resetUI();
                } else {
                    resetUI();
                }
            } else { alert(result.message); resetUI(); }
        } catch (e) { alert('语音计算中枢网关连接崩溃。'); resetUI(); }
    };

    recordBtn.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => { 
                    sendAudioToServer(new Blob(audioChunks, { type: 'audio/webm' })); 
                    stream.getTracks().forEach(t => t.stop()); 
                };
                mediaRecorder.start();
                isRecording = true; 
                recordBtn.classList.add('recording'); 
                visualizer.classList.add('active'); 
                recordStatus.textContent = '系统正在倾听您的心声...';
            } catch (err) { alert('未能成功拉起麦克风采集硬件。'); }
        } else {
            mediaRecorder.stop(); 
            isRecording = false; 
            recordStatus.textContent = '私有化计算集群动态推演中...';
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
            _autoContinue = false;
            _fetchingNext = false;
        }
        _lastUserMessage = silent ? _lastUserMessage : text;

        // 静默请求不创建聊天气泡
        const sDiv = document.createElement('div');
        sDiv.className = 'message system-message';
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
            // 静默请求：sDiv 没挂到 DOM，先挂上
            if (sDiv && !sDiv.parentNode) {
                chatBox.appendChild(sDiv);
            }
            const items = payload.items || [];
            playPlanItems(items, sDiv);
            return;
        }
    };

    // ================= 10. PlanResponse items[] 渲染与播放队列 =================
    let _lastUserMessage = '';
    let _isPlaying = false;
    let _autoContinue = true;
    let _fetchingNext = false; // 防双重请求
    let _pendingItems = []; // 预生成的待播项

    const playPlanItems = async (items, container) => {
        if (!items.length) return;

        const isRecommend = /推荐/.test(_lastUserMessage);

        // 正在播放 + 新计划来了 → 只入队，不渲染（等自然切歌时逐个出现）
        if (_isPlaying && !isRecommend) {
            _fetchingNext = false;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'song' && item.audioUrl) {
                    let prevTtsUrl = '', prevTtsText = '';
                    for (let j = i - 1; j >= 0; j--) {
                        if (items[j].type === 'tts' && items[j].ttsAudioUrl) {
                            prevTtsUrl = items[j].ttsAudioUrl;
                            prevTtsText = items[j].text || '';
                            break;
                        }
                    }
                    addToPlayQueue('song', item.audioUrl, `🎵 《${item.title}》 - ${item.artist}`, prevTtsUrl, prevTtsText);
                }
            }
            return;
        }

        _isPlaying = true;
        _fetchingNext = false;

        if (isRecommend) {
            // ── 推荐模式：一次性渲染所有卡片，用户自己选歌 ──
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
            // ── 电台模式：逐首渲染，逐首播放 ──
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
                        const desc = `🎵 《${item.title}》 - ${item.artist}`;
                        let prevTtsUrl = '', prevTtsText = '';
                        for (let j = i - 1; j >= 0; j--) {
                            if (items[j].type === 'tts' && items[j].ttsAudioUrl) {
                                prevTtsUrl = items[j].ttsAudioUrl;
                                prevTtsText = items[j].text || '';
                                break;
                            }
                        }
                        addToPlayQueue('song', item.audioUrl, desc, prevTtsUrl, prevTtsText);
                        currentQueueIndex = playQueue.length - 1;
                        resetAllCardButtons();
                        currentPlayingCard = d.querySelector('.song-card');
                        if (currentPlayingCard) {
                            const btn = currentPlayingCard.querySelector('.song-play-btn');
                            if (btn) btn.textContent = '⏸';
                        }
                        fetch('/api/player/report-play', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: item.title, artist: item.artist, songId: item.songId })
                        }).catch(() => {});
                        await playAudio(item.audioUrl, desc);
                    }
                }
            }
        }

        // 播完如果队列快空了，后台静默预取下一批（只入队不渲染）
        _isPlaying = false;
        resetUI();
        if (playQueue.length - currentQueueIndex <= 2 && !_fetchingNext) {
            _fetchingNext = true;
            sendTextDispatch('继续', true);
        }
    };

    const playAudio = (url, desc) => {
        return new Promise((resolve) => {
            if (audioPlayer.src !== url) {
                audioPlayer.src = url;
            }
            audioPlayer.play()
                .then(() => {
                    djInfoTitle.textContent = '正在播放';
                    djInfoDesc.textContent = desc;
                    recordStatus.textContent = '播放中...';
                    if (currentPlayingCard) {
                        const btn = currentPlayingCard.querySelector('.song-play-btn');
                        if (btn) btn.textContent = '⏸';
                    }
                })
                .catch(() => {});
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

    // 播放指定队列索引（自动处理串词→歌曲）
    const playQueueItem = async (index) => {
        if (index < 0 || index >= playQueue.length) return;

        // 重置旧卡片 UI
        if (currentPlayingCard) {
            const oldBtn = currentPlayingCard.querySelector('.song-play-btn');
            if (oldBtn) oldBtn.textContent = '▶';
            const oldFill = currentPlayingCard.querySelector('.song-progress-fill');
            if (oldFill) oldFill.style.width = '0%';
        }

        currentQueueIndex = index;
        const item = playQueue[index];

        // 找到或创建卡片
        let card = document.querySelector(`.song-card[data-audio-url="${item.url.replace(/"/g, '\\"')}"]`);
        if (!card && item.desc) {
            const nameMatch = item.desc.match(/《(.+?)》.*-(.+)/);
            const d = document.createElement('div');
            d.innerHTML = renderSongCard({ title: nameMatch?.[1] || '', artist: (nameMatch?.[2] || '').trim(), audioUrl: item.url });
            const chatBox = document.getElementById('chat-box');
            if (chatBox) { chatBox.appendChild(d.firstElementChild); scrollToBottom(); }
            card = document.querySelector(`.song-card[data-audio-url="${item.url.replace(/"/g, '\\"')}"]`);
        }
        if (card) {
            currentPlayingCard = card;
            const btn = card.querySelector('.song-play-btn');
            if (btn) btn.textContent = '⏸';
        }

        // 先播串词 TTS
        if (item.ttsUrl) {
            await new Promise((resolve) => {
                audioPlayer.src = item.ttsUrl;
                audioPlayer.play().then(() => {
                    djInfoTitle.textContent = 'DJ 串词';
                    djInfoDesc.textContent = item.ttsText || '';
                }).catch(() => {});
                audioPlayer.onended = resolve;
                audioPlayer.onerror = resolve;
            });
        }
        // 再播歌曲
        audioPlayer.src = item.url;
        audioPlayer.play().then(() => {
            djInfoTitle.textContent = '正在播放';
            djInfoDesc.textContent = item.desc;
            recordStatus.textContent = '播放中...';
        }).catch(() => {});
        audioPlayer.onended = () => {
            if (currentQueueIndex < playQueue.length - 1) {
                playQueueItem(currentQueueIndex + 1);
            }
        };
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
            _fetchingNext = true;
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
