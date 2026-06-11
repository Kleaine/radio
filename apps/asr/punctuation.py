
# -*- coding: utf-8 -*-
"""
基于 BERT 的智能标点恢复
使用模型: p208p2002/zh-wiki-punctuation-restore

注意: 该模型仅用于中文文本。英文/数字文本会回退到规则方案
"""

import re

_punc_model = None
_punc_tokenizer = None
_punc_model_initialized = False
_fallback_enabled = True


def safe_print(s):
    import sys
    try: print(s)
    except:
        try: print(s.encode('utf-8').decode(sys.stdout.encoding, errors='replace'))
        except: pass


def has_chinese_content(text):
    """判断文本是否包含中文字符

    现在 BERT 模型通过 offset_mapping 可以正确处理中英文混合文本，
    只要有中文就可以用 BERT 模型加标点；纯英文用规则方案。
    """
    if not text:
        return False
    clean = text.strip()
    if not clean:
        return False
    chinese_count = sum(1 for c in clean if '\u4e00' <= c <= '\u9fff')
    return chinese_count > 0


def init_punc_model():
    global _punc_model, _punc_tokenizer, _punc_model_initialized
    if _punc_model_initialized:
        return _punc_model is not None
    _punc_model_initialized = True
    try:
        from transformers import AutoTokenizer, AutoModelForTokenClassification
        safe_print("正在加载标点恢复模型...")
        model_name = "p208p2002/zh-wiki-punctuation-restore"
        _punc_tokenizer = AutoTokenizer.from_pretrained(model_name)
        _punc_model = AutoModelForTokenClassification.from_pretrained(model_name)
        safe_print("标点恢复模型加载成功!")
        return True
    except Exception as e:
        safe_print(f"标点恢复模型加载失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def add_punctuation_transformers(text):
    if not _punc_model or not _punc_tokenizer:
        if not init_punc_model():
            return None

    try:
        import torch

        text = text.strip()
        if not text:
            return text

        # 关键改进: 使用 offset_mapping 记录每个 token 对应原始文本的字符位置
        # 这样即使英文被 tokenizer 变成 [UNK]，我们也能从原文取回正确的字符
        inputs = _punc_tokenizer(
            text, return_tensors='pt', padding=True, truncation=True,
            max_length=512, return_offsets_mapping=True)

        # 保存 offset_mapping 后再从 inputs 中移除（模型不需要这个字段）
        offsets = inputs.pop('offset_mapping')[0].tolist()

        with torch.no_grad():
            outputs = _punc_model(**inputs)
            predictions = torch.argmax(outputs.logits, dim=-1)

        id2label = _punc_model.config.id2label
        labels = predictions[0].cpu().numpy()

        # 改进方案：用 offset_mapping 从原始文本取字符 + 标点标签插入标点
        result = []
        for (start, end), label_id in zip(offsets, labels):
            # start == 0 and end == 0 表示特殊 token ([CLS], [SEP], [PAD] 等)
            if start == 0 and end == 0:
                continue
            # 从原始文本取回这个 token 对应的真实字符（包括英文/数字等被 tokenizer 变成 [UNK] 的内容）
            orig_seg = text[start:end]
            result.append(orig_seg)
            # 在当前 token 后面插入预测的标点
            label = id2label.get(label_id, 'O')
            if label != 'O' and label.startswith('S-'):
                punc = label[2:]
                result.append(punc)

        final_text = ''.join(result)
        # 清理重复/多余的标点
        final_text = re.sub(r'[，。？！；：]+([。？！])', r'\1', final_text)
        final_text = re.sub(r'[，。？！；：]+$', '', final_text)

        if not any(p in final_text for p in ['。', '？', '！', '.', '?', '!']):
            final_text += '。'

        return final_text

    except Exception as e:
        safe_print(f"Transformer 模型标点失败: {e}")
        return None


def add_punctuation_rules(text):
    if not text or not text.strip():
        return text

    result = text.strip()
    has_chinese = any('\u4e00' <= c <= '\u9fff' for c in result)

    if has_chinese:
        time_patterns = [
            (r'(今天|明天|后天|昨天|上午|下午|晚上|早上|中午)(?!，|。|？|！)', r'\1，'),
        ]
        for pattern, replacement in time_patterns:
            result = re.sub(pattern, replacement, result)

        conj_patterns = [
            (r'(但是|不过|可是|然而|因此|所以|于是|而且|另外|此外)(?!，|。|？|！)', r'\1，'),
        ]
        for pattern, replacement in conj_patterns:
            result = re.sub(pattern, replacement, result)

        action_patterns = [
            (r'(我想|我觉得|我认为|我希望|你看|你说|咱们|我们)(?!，|。|？|！)', r'\1，'),
        ]
        for pattern, replacement in action_patterns:
            result = re.sub(pattern, replacement, result)

    if result and not any(result.endswith(p) for p in ['。', '？', '！', '，', '；', '：', '.', '?', '!']):
        if has_chinese:
            result += '。'
        else:
            result += '.'

    result = re.sub(r'，。', '。', result)
    return result


def add_punctuation(text):
    if not text or not text.strip():
        return text

    if _fallback_enabled:
        if has_chinese_content(text):
            bert_result = add_punctuation_transformers(text)
            if bert_result:
                return bert_result

    return add_punctuation_rules(text)
