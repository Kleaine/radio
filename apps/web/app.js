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

    // 初始化默认声线为 温柔女声
    let currentVoice = 'gentle_female';
    let localToken = localStorage.getItem('dj_auth_token') || '';
    let mediaRecorder, audioChunks = [], isRecording = false;

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

    // ================= 6. 核心业务层：全新双流串联控制逻辑 =================
    voiceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            voiceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentVoice = tab.getAttribute('data-voice');
        });
    });

    const sendAudioToServer = async (blob) => {
        const formData = new FormData();
        formData.append('audio', blob, 'user_voice.webm');
        formData.append('voice_style', currentVoice); // 将前端选定的女性声线送往后端渲染TTS

        try {
            const response = await fetch('/api/chat', { 
                method: 'POST', 
                body: formData,
                headers: { 'Authorization': `Bearer ${localToken}` }
            });
            const result = await response.json();
            if (result.code === 200) {
                const { userText, replyText, audioUrl, recommendSong } = result.data;
                
                // 1. 动态追加对话消息气泡到面板上
                const uDiv = document.createElement('div'); 
                uDiv.className = 'message user-message'; 
                uDiv.innerHTML = `<div class="message-content">${userText}</div>`;
                chatBox.appendChild(uDiv);
                
                const sDiv = document.createElement('div'); 
                sDiv.className = 'message system-message';
                let html = `<div class="message-content">${replyText}</div>`;
                if (recommendSong) {
                    html += `
                        <div class="recommendation-card">
                            🎵 推荐曲目：《${recommendSong.title}》 - ${recommendSong.artist}
                            <br><small style="color:var(--text-muted)">💡 决策因子：${recommendSong.reason}</small>
                        </div>`;
                }
                sDiv.innerHTML = html;
                chatBox.appendChild(sDiv);
                chatBox.parentElement.scrollTop = chatBox.parentElement.scrollHeight;
                
                // 2. 双音频流高级自动化调度控制总线开始工作
                if (audioUrl) {
                    // 第一阶段：首先载入并播放使用选定声线生成的“歌曲介绍”TTS文件
                    audioPlayer.src = audioUrl;
                    audioPlayer.play()
                        .then(() => {
                            djInfoTitle.textContent = '为您播报中';
                            djInfoDesc.textContent = replyText;
                            recordStatus.textContent = 'DJ 正在播报歌曲介绍...';
                        })
                        .catch(() => resetUI());
                    
                    // 核心监听：当第一阶段的歌曲口播介绍播放完毕之后触发
                    audioPlayer.onended = () => {
                        // 第二阶段：自动抓取后端给出的歌曲物理文件并装载播放
                        if (recommendSong && recommendSong.songUrl) {
                            audioPlayer.src = recommendSong.songUrl;
                            audioPlayer.play()
                                .then(() => {
                                    djInfoTitle.textContent = '正在播放歌曲';
                                    djInfoDesc.textContent = `🎵 《${recommendSong.title}》 - ${recommendSong.artist}`;
                                    recordStatus.textContent = '音乐播放中，享受这一刻...';
                                })
                                .catch(() => resetUI());
                            
                            // 终焉阶段：当整首推荐歌曲彻底播放完后，重置系统UI回初始就绪态
                            audioPlayer.onended = () => {
                                resetUI();
                            };
                        } else {
                            resetUI();
                        }
                    };
                } else if (recommendSong && recommendSong.songUrl) {
                    // 安全容错：如果后端意外未能给出介绍音频，则前端直接免介绍切歌播放
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

    const resetUI = () => {
        djInfoTitle.textContent = '等待为您服务...';
        djInfoDesc.textContent = '点击下方录音按钮开始对话';
        recordStatus.textContent = '按住或点击开始说话';
        recordBtn.classList.remove('recording');
        visualizer.classList.remove('active');
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
});