
import os
import sys
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
save_dir = os.path.join(BASE_DIR, 'models', 'whisper-tiny')
os.makedirs(save_dir, exist_ok=True)

HUGGINGFACE_URL = "https://huggingface.co/openai/whisper-tiny/resolve/main"

files_to_download = [
    "config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "added_tokens.json",
    "normalizer.json",
    "merges.txt",
    "model.safetensors",
]

print(f'开始下载 whisper-tiny 模型到: {save_dir}')
print(f'文件列表: {files_to_download}')
sys.stdout.flush()

def download_file(url, dest_path):
    if os.path.exists(dest_path):
        print(f'  已存在: {os.path.basename(dest_path)}')
        return True

    try:
        print(f'  下载: {os.path.basename(dest_path)}...')
        sys.stdout.flush()

        response = requests.get(url, stream=True, timeout=120)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and downloaded % (1024*1024) < 8192:
                        pct = (downloaded / total_size) * 100
                        print(f'    进度: {pct:.1f}% ({downloaded//(1024*1024)}MB/{total_size//(1024*1024)}MB)')
                        sys.stdout.flush()

        print(f'  完成: {os.path.basename(dest_path)}')
        return True
    except Exception as e:
        print(f'  失败: {os.path.basename(dest_path)} - {e}')
        return False

success = True
for fname in files_to_download:
    url = f'{HUGGINGFACE_URL}/{fname}'
    dest = os.path.join(save_dir, fname)
    if not download_file(url, dest):
        success = False

print(f'\n下载完成。成功: {success}')
sys.stdout.flush()

if success:
    print('验证模型文件...')
    sys.stdout.flush()
    try:
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
        model = WhisperForConditionalGeneration.from_pretrained(save_dir)
        processor = WhisperProcessor.from_pretrained(save_dir)
        print('模型从本地加载成功!')
        sys.stdout.flush()
    except Exception as e:
        print(f'加载失败: {e}')
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
