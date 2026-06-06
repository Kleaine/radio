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
    let currentPlayingCard = null; // 当前播放的歌曲卡片
    
    // 导航按钮节点
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

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
    const sendTextDispatch = async (text) => {
        console.log('sendTextDispatch 被调用，text:', text);
        textSendBtn.disabled = true;
        textInput.disabled = true;
        recordStatus.textContent = 'AI 思考中...';

        appendUserMessage(text);

        // 创建系统消息气泡，用于流式追加
        const sDiv = document.createElement('div');
        sDiv.className = 'message system-message';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = '';
        sDiv.appendChild(contentDiv);
        chatBox.appendChild(sDiv);
        scrollToBottom();

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
                            contentDiv.textContent += data;
                            scrollToBottom();
                        } else if (currentEvent === 'done') {
                            handleDoneEvent(data, sDiv);
                        }
                        currentEvent = null;
                    } else if (line === '') {
                        // SSE 空行分隔
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
                        contentDiv.textContent += data;
                    } else if (currentEvent === 'done') {
                        handleDoneEvent(data, sDiv);
                    }
                }
            }
        } catch (err) {
            contentDiv.textContent = '请求失败，请稍后重试。';
            console.error('dispatch error:', err);
        } finally {
            resetUI();
        }
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
            // 指令匹配成功，无需额外渲染
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
            playPlanItems(items, sDiv);
            return;
        }
    };

    // ================= 10. PlanResponse items[] 渲染与播放队列 =================
    const playPlanItems = async (items, container) => {
        if (!items.length) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === 'tts') {
                // 跳过第一段 tts 开场白（流式推送时已显示）
                if (i === 0) {
                    if (item.ttsAudioUrl) {
                        await playAudio(item.ttsAudioUrl, item.text || 'DJ 播报');
                    }
                    continue;
                }
                const ttsDiv = document.createElement('div');
                ttsDiv.className = 'tts-card';
                ttsDiv.textContent = item.text || '';
                container.appendChild(ttsDiv);
                scrollToBottom();

                if (item.ttsAudioUrl) {
                    await playAudio(item.ttsAudioUrl, item.text || 'DJ 播报');
                }
            } else if (item.type === 'song') {
                const songDiv = document.createElement('div');
                songDiv.innerHTML = renderSongCard(item);
                container.appendChild(songDiv);
                scrollToBottom();

                if (item.audioUrl) {
                    const desc = `🎵 《${item.title}》 - ${item.artist}`;
                    addToPlayQueue(item.audioUrl, desc);
                    currentQueueIndex = playQueue.length - 1;
                    currentPlayingCard = songDiv.querySelector('.song-card');
                    updateNavButtons();
                    await playAudio(item.audioUrl, desc);
                }
            }
        }

        resetUI();
    };

    const playAudio = (url, desc) => {
        return new Promise((resolve) => {
            if (audioPlayer.src === url && audioPlayer.paused) {
                audioPlayer.play()
                    .then(() => {
                        djInfoTitle.textContent = '正在播放';
                        djInfoDesc.textContent = desc;
                        recordStatus.textContent = '播放中...';
                    })
                    .catch(() => {
                        // 播放失败也继续队列
                    });
            } else {
                audioPlayer.src = url;
                audioPlayer.play()
                    .then(() => {
                        djInfoTitle.textContent = '正在播放';
                        djInfoDesc.textContent = desc;
                        recordStatus.textContent = '播放中...';
                    })
                    .catch(() => {
                        // 播放失败也继续队列
                    });
            }
            audioPlayer.onended = resolve;
            audioPlayer.onerror = resolve;
        });
    };

    // 添加到播放队列
    const addToPlayQueue = (url, desc) => {
        const existingIndex = playQueue.findIndex(item => item.url === url);
        if (existingIndex === -1) {
            playQueue.push({ url, desc });
        }
        updateNavButtons();
    };

    // 更新导航按钮状态（仅当元素存在时）
    const updateNavButtons = () => {
        if (prevBtn) {
            prevBtn.classList.toggle('disabled', currentQueueIndex <= 0);
        }
        if (nextBtn) {
            nextBtn.classList.toggle('disabled', currentQueueIndex >= playQueue.length - 1);
        }
    };

    // 播放指定索引的歌曲
    const playQueueItem = (index) => {
        if (index < 0 || index >= playQueue.length) return;
        currentQueueIndex = index;
        const item = playQueue[index];
        audioPlayer.src = item.url;
        audioPlayer.play()
            .then(() => {
                djInfoTitle.textContent = '正在播放';
                djInfoDesc.textContent = item.desc;
                recordStatus.textContent = '播放中...';
            })
            .catch(() => {});
        updateNavButtons();
    };

    // 上一首
    const playPrev = () => {
        if (currentQueueIndex > 0) {
            playQueueItem(currentQueueIndex - 1);
        }
    };

    // 下一首
    const playNext = () => {
        if (currentQueueIndex < playQueue.length - 1) {
            playQueueItem(currentQueueIndex + 1);
        }
    };

    // 导航按钮事件绑定（仅当元素存在时才绑定）
    if (prevBtn) {
        prevBtn.addEventListener('click', playPrev);
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', playNext);
    }

    // 格式化时间显示
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 更新进度条（更新当前播放歌曲卡片中的进度条）
    const updateProgress = () => {
        if (!currentPlayingCard || audioPlayer.duration <= 0) return;
        
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        const progressFill = currentPlayingCard.querySelector('.song-progress-fill');
        const currentTimeEl = currentPlayingCard.querySelector('.song-current-time');
        const durationEl = currentPlayingCard.querySelector('.song-duration');
        
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
        if (durationEl) {
            durationEl.textContent = formatTime(audioPlayer.duration);
        }
    };

    // 监听播放进度
    audioPlayer.addEventListener('timeupdate', updateProgress);
    
    // 监听音频加载完成
    audioPlayer.addEventListener('loadedmetadata', () => {
        if (!currentPlayingCard) return;
        const durationEl = currentPlayingCard.querySelector('.song-duration');
        if (durationEl) {
            durationEl.textContent = formatTime(audioPlayer.duration);
        }
    });
    
    // 监听播放结束
    audioPlayer.addEventListener('ended', () => {
        if (!currentPlayingCard) return;
        const progressFill = currentPlayingCard.querySelector('.song-progress-fill');
        const currentTimeEl = currentPlayingCard.querySelector('.song-current-time');
        if (progressFill) progressFill.style.width = '0%';
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
    });

    const renderSongCard = (song, selectable = false) => {
        const title = escapeHtml(song.title || '');
        const artist = escapeHtml(song.artist || '');
        const reason = escapeHtml(song.reason || '');
        const cover = song.coverUrl ? `<img src="${escapeHtml(song.coverUrl)}" alt="cover">` : `<div class="cover-placeholder">🎵</div>`;
        const playable = !!song.audioUrl;
        const audioUrlEscaped = playable ? escapeHtml(song.audioUrl) : '';
        const unplayable = !playable ? `<div class="unplayable">无法播放</div>` : '';
        const reasonHtml = reason ? `<div class="reason">💡 ${reason}</div>` : '';

        // 播放控制区域（进度条在上，按钮在下）
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
                    <button class="song-prev-btn" data-url="${audioUrlEscaped}" title="上一首">⏮</button>
                    <button class="song-play-btn" data-url="${audioUrlEscaped}" title="播放">▶</button>
                    <button class="song-next-btn" data-url="${audioUrlEscaped}" title="下一首">⏭</button>
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

    // 事件委托：点击歌曲卡片中的播放按钮
    chatBox.addEventListener('click', (e) => {
        // 播放按钮
        const playBtn = e.target.closest('.song-play-btn');
        if (playBtn) {
            const url = playBtn.getAttribute('data-url');
            if (url) {
                const songCard = playBtn.closest('.song-card');
                currentPlayingCard = songCard;
                audioPlayer.src = url;
                audioPlayer.play()
                    .then(() => {
                        playBtn.textContent = '⏸';
                        djInfoTitle.textContent = '正在播放';
                        recordStatus.textContent = '播放中...';
                    })
                    .catch(() => {});
            }
            return;
        }

        // 上一首按钮
        const prevBtn = e.target.closest('.song-prev-btn');
        if (prevBtn) {
            playPrev();
            return;
        }

        // 下一首按钮
        const nextBtn = e.target.closest('.song-next-btn');
        if (nextBtn) {
            playNext();
            return;
        }
    });

    // 文本输入事件绑定
    textSendBtn.addEventListener('click', () => {
        console.log('发送按钮被点击');
        const text = textInput.value.trim();
        if (!text) return;
        textInput.value = '';
        sendTextDispatch(text);
        textInput.focus();
    });

    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            console.log('Enter键被按下');
            textSendBtn.click();
        }
    });

    // 页面加载完成后自动聚焦输入框并确保启用
    setTimeout(() => {
        console.log('页面加载完成，初始化输入框');
        console.log('textInput:', textInput);
        console.log('textSendBtn:', textSendBtn);
        textInput.disabled = false;
        textSendBtn.disabled = false;
        textInput.focus();
    }, 500);
});
