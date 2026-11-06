import json
import os
import re
import sys

ALLOWED_MODELS = {'tiny', 'base', 'small'}
MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_AUDIO_SECONDS = 15 * 60


def transcribe_audio(audio_path: str, model_name: str = 'tiny') -> dict:
    if not os.path.isfile(audio_path):
        return {'success': False, 'error': 'Ficheiro de áudio não encontrado.'}
    try:
        if os.path.getsize(audio_path) > MAX_AUDIO_BYTES:
            return {'success': False, 'error': 'Ficheiro de áudio demasiado grande.'}
    except OSError:
        return {'success': False, 'error': 'Não foi possível aceder ao áudio.'}

    if model_name not in ALLOWED_MODELS:
        return {'success': False, 'error': 'Modelo de transcrição não permitido.'}

    try:
        from faster_whisper import WhisperModel
        try:
            import torch
            has_cuda = bool(torch.cuda.is_available())
        except ImportError:
            has_cuda = False

        script_dir = os.path.dirname(os.path.abspath(__file__))
        local_model_dir = os.path.join(script_dir, 'models', model_name)
        if not os.path.isfile(os.path.join(local_model_dir, 'model.bin')):
            return {'success': False, 'error': 'Modelo local não instalado.'}

        device = 'cuda' if has_cuda else 'cpu'
        compute_type = 'float16' if has_cuda else 'int8'
        model = WhisperModel(local_model_dir, device=device, compute_type=compute_type)
        segments, info = model.transcribe(
            audio_path,
            language='pt',
            beam_size=3,
            best_of=3,
            temperature=0.0,
            initial_prompt='Português de Portugal para DriverWise TVDE, Uber, Bolt e FreeNow.',
            vad_filter=True,
            vad_parameters={'min_silence_duration_ms': 500},
        )

        duration = float(getattr(info, 'duration', 0) or 0)
        if duration > MAX_AUDIO_SECONDS:
            return {'success': False, 'error': 'O áudio excede 15 minutos.'}

        text_segments = [segment.text.strip() for segment in segments if segment.text and segment.text.strip()]
        full_text = re.sub(r'\s+', ' ', ' '.join(text_segments)).strip()
        if not full_text:
            return {'success': False, 'error': 'Não foi detetado texto no áudio.'}
        return {
            'success': True,
            'text': full_text[:20_000],
            'language': getattr(info, 'language', 'pt'),
            'duration': round(duration, 2),
            'device': device,
        }
    except Exception:
        return {'success': False, 'error': 'Falha interna na transcrição.'}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        result = {'success': False, 'error': 'Caminho do áudio em falta.'}
        sys.exit(1)
    result = transcribe_audio(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'tiny')
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + '\n')
    sys.stdout.flush()
    sys.exit(0 if result.get('success') else 1)
