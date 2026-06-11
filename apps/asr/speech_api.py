
# -*- coding: utf-8 -*-
import os
import sys
import tempfile
import uuid
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import soundfile as sf
from punctuation import add_punctuation

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

recognizer = None
mic = None

whisper_model = None
whisper_processor = None


def safe_print(s):
    try: print(s)
    except:
        try: print(s.encode('utf-8').decode(sys.stdout.encoding, errors='replace'))
        except: pass


def init_whisper():
    global whisper_model, whisper_processor
    whisper_dir = os.path.join(BASE_DIR, 'models', 'whisper-tiny')

    if not os.path.exists(whisper_dir):
        safe_print(f"Whisper 模型目录不存在: {whisper_dir}")
        safe_print("请运行: python download_whisper.py")
        return False

    try:
        safe_print("正在加载 Whisper 模型...")
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        whisper_model = WhisperForConditionalGeneration.from_pretrained(whisper_dir)
        whisper_processor = WhisperProcessor.from_pretrained(whisper_dir)
        safe_print("Whisper 模型加载成功!")
        return True
    except Exception as e:
        safe_print(f"Whisper 初始化失败: {e}")
        return False


def recognize_with_whisper(audio_path):
    global whisper_model, whisper_processor
    if whisper_model is None or whisper_processor is None:
        return None, "Whisper 模型未加载"

    try:
        import numpy as np
        audio, sr = sf.read(audio_path)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            try:
                from scipy.signal import resample
                audio = resample(audio, int(len(audio) * 16000 / sr))
            except: pass
        audio = audio.astype(np.float32)
        input_features = whisper_processor(audio, sampling_rate=16000, return_tensors="pt").input_features
        forced_decoder_ids = whisper_processor.get_decoder_prompt_ids(language="chinese", task="transcribe")
        predicted_ids = whisper_model.generate(input_features, forced_decoder_ids=forced_decoder_ids)
        transcription = whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True)

        if transcription and len(transcription) > 0:
            text = transcription[0].strip()
            return text, "success"
        return None, "未识别到内容"
    except Exception as e:
        safe_print(f"Whisper 识别错误: {e}")
        return None, str(e)


def init_recognition():
    global recognizer, mic
    try:
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        mic = sr.Microphone()
        return True
    except Exception as e:
        safe_print(f"初始化麦克风失败: {e}")
        return False


def convert_audio(input_path, output_path):
    try:
        data, samplerate = sf.read(input_path)
        sf.write(output_path, data, samplerate, subtype='PCM_16')
        return True
    except: pass
    try:
        import subprocess
        cmd = ['ffmpeg', '-y', '-i', input_path, '-ar', '16000', '-ac', '1', output_path]
        r = subprocess.run(cmd, capture_output=True, timeout=30)
        if r.return_code == 0 and os.path.exists(output_path):
            return True
    except: pass
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(input_path).set_frame_rate(16000).set_channels(1)
        audio.export(output_path, format='wav')
        return True
    except: pass
    return False


def process_audio_file(file_storage):
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}")
    converted_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}.wav")

    try:
        file_data = file_storage.read()
        with open(temp_path, 'wb') as f:
            f.write(file_data)

        use_path = temp_path
        if convert_audio(temp_path, converted_path):
            use_path = converted_path

        audio_duration = 0
        try:
            audio_info, sr = sf.read(use_path)
            audio_duration = len(audio_info) / sr if sr > 0 else 0
        except: pass

        if audio_duration > 0 and audio_duration < 0.3:
            return {'status': 'error', 'message': '音频太短'}, temp_dir, temp_path, converted_path

        if audio_duration > 120:
            return {'status': 'error', 'message': f'音频过长（{round(audio_duration, 1)}秒）'}, temp_dir, temp_path, converted_path

        result = {
            'status': 'ok',
            'audio_duration': round(audio_duration, 1),
            'text': '',
            'results': {}
        }

        whisper_text, whisper_status = recognize_with_whisper(use_path)
        whisper_success = whisper_text and whisper_status == "success"
        if whisper_success:
            text_with_punc = add_punctuation(whisper_text)
            result['results']['whisper'] = {
                'text': text_with_punc, 'raw_text': whisper_text,
                'status': 'success', 'engine': 'whisper-local'
            }
            result['text'] = text_with_punc
        else:
            result['results']['whisper'] = {
                'status': 'error', 'message': whisper_status, 'engine': 'whisper-local'
            }

        google_success = False
        try:
            import speech_recognition as sr
            r = sr.Recognizer()
            with sr.AudioFile(use_path) as source:
                audio_data = r.record(source)
            text_google = r.recognize_google(audio_data, language='zh-CN')
            text_with_punc = add_punctuation(text_google)
            result['results']['google'] = {
                'text': text_with_punc, 'raw_text': text_google,
                'status': 'success', 'engine': 'google-api'
            }
            google_success = True
            if not result['text']:
                result['text'] = text_with_punc
        except Exception as e:
            result['results']['google'] = {
                'status': 'error', 'message': str(e)[:200], 'engine': 'google-api'
            }

        if not google_success and whisper_success:
            result['results']['google'] = {
                'text': result['results']['whisper']['text'],
                'raw_text': result['results']['whisper']['raw_text'],
                'status': 'success',
                'engine': 'whisper-local-via-google-field'
            }

        if not result['text']:
            result['status'] = 'partial'
            result['message'] = '所有识别引擎均失败'

        return result, temp_dir, temp_path, converted_path

    except Exception as e:
        return {'status': 'error', 'message': str(e)}, temp_dir, temp_path, converted_path


def cleanup_paths(paths):
    for p in paths:
        try:
            if os.path.exists(p):
                if os.path.isdir(p):
                    os.rmdir(p)
                else:
                    os.unlink(p)
        except: pass


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'diagnostic_plus.html')


@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'whisper_available': whisper_model is not None,
        'mic_available': mic is not None,
        'message': '语音识别 API 服务运行中'
    })


@app.route('/recognize/file', methods=['POST'])
def recognize_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400

    result, temp_dir, temp_path, converted_path = process_audio_file(file)
    cleanup_paths([temp_path, converted_path, temp_dir])
    return jsonify(result)


@app.route('/recognize/live', methods=['POST'])
def recognize_live():
    try:
        data = request.get_json() or {}
        duration = data.get('duration', 3)

        if not recognizer or not mic:
            return jsonify({'status': 'error', 'message': '录音设备未初始化'}), 400

        safe_print(f"开始录音，时长: {duration}秒")
        with mic as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.5)
            audio = recognizer.listen(source, timeout=duration+5, phrase_time_limit=duration)

        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}.wav")
        try:
            with open(temp_path, 'wb') as f:
                f.write(audio.get_wav_data())

            result = {'status': 'ok', 'engine': 'whisper', 'text': '', 'raw_text': ''}
            whisper_text, whisper_status = recognize_with_whisper(temp_path)
            if whisper_text and whisper_status == "success":
                result['text'] = add_punctuation(whisper_text)
                result['raw_text'] = whisper_text
            else:
                try:
                    text = recognizer.recognize_google(audio, language='zh-CN')
                    result['text'] = add_punctuation(text)
                    result['engine'] = 'google'
                    result['raw_text'] = text
                except:
                    return jsonify({'status': 'error', 'message': '无法识别语音'}), 400
            return jsonify(result)
        finally:
            cleanup_paths([temp_path, temp_dir])

    except Exception as e:
        safe_print(f"实时识别错误: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == '__main__':
    safe_print("=" * 70)
    safe_print("语音识别 API 服务器 (Whisper 本地引擎)")
    safe_print("=" * 70)
    safe_print("正在初始化...")

    if not init_whisper():
        safe_print("警告: Whisper 初始化失败，将使用 Google API 作为备选")
    if not init_recognition():
        safe_print("警告: 麦克风不可用（服务器端实时录音功能关闭）")

    safe_print("启动服务器...")
    safe_print("API: http://localhost:5000")
    safe_print("=" * 70)
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
