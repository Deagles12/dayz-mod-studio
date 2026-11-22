"""Local export of a textured GLB into a visual DayZ model."""
import base64
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import time

from locale_studio import tr
from pipeline import lines, steam_installs
from export_folders import output_folder
from texture_export import image_to_paa_path


def read_glb(value):
    path = Path(value).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() != '.glb' or path.stat().st_size > 64 * 1024**2:
        raise ValueError(tr('Вибери GLB розміром до 64 МБ.', 'Choose a GLB of up to 64 MB.'))
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('Incomplete GLB')
    magic, version, size, json_size, chunk = struct.unpack_from('<4sIII4s', data)
    if (magic, version, size, chunk) != (b'glTF', 2, len(data), b'JSON') or json_size > size - 20:
        raise ValueError('Invalid GLB header')
    model = json.loads(data[20:20 + json_size])
    if any('uri' in entry for key in ('buffers', 'images') for entry in model.get(key, [])):
        raise ValueError(tr('GLB має містити текстуру всередині файла.', 'The GLB must embed its texture.'))
    return path, data


def blender_path():
    candidates = [
        os.environ.get('DAYZ_BLENDER'),
        shutil.which('blender'),
        *(str(path) for drive in ('C:/', 'D:/', 'E:/', 'F:/')
          for path in sorted(Path(drive).glob('blender-*/blender.exe'), reverse=True)),
        *(str(root / 'Blender/blender.exe') for root in steam_installs()),
        *(str(path) for path in sorted(Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
          .glob('Blender Foundation/Blender */blender.exe'), reverse=True)),
        *(str(path) for path in sorted((Path.home() / 'Documents/Codex')
          .glob('*/*/outputs/DayZPipeline/tools/blender-*/blender.exe'), reverse=True)),
    ]
    for value in candidates:
        if value and Path(value).is_file():
            return Path(value)
    raise FileNotFoundError(tr('Blender не знайдено. Встанови Blender або задай DAYZ_BLENDER.',
                              'Blender was not found. Install Blender or set DAYZ_BLENDER.'))


def export_model(request, progress=lambda stage: None):
    progress(1)
    source, _ = read_glb(request['path'])
    settings = request.get('settings', {})
    converter = image_to_paa_path(settings)
    blender = blender_path()
    prefix = 'dayz_models'
    addons = lines(str(settings.get('addons', '')))
    if request.get('root') and len(addons) == 1:
        root = Path(request['root']).resolve()
        addon = (root / addons[0]).resolve()
        if addon.is_relative_to(root) and (addon / 'config.cpp').is_file():
            marker = addon / '$PBOPREFIX$'
            declared = marker.read_text(encoding='utf-8-sig').strip() if marker.is_file() else ''
            configured = str(settings.get('prefix', '')).strip()
            if configured and declared and configured != declared:
                raise ValueError(tr('Префікс у налаштуваннях не збігається з $PBOPREFIX$.',
                                    'The configured prefix differs from $PBOPREFIX$.'))
            prefix = configured or declared or str(settings.get('addon_name', '')).strip() or addon.name
    prefix = prefix.replace('/', '\\')
    if not re.fullmatch(r'[A-Za-z0-9_-]+(?:\\[A-Za-z0-9_-]+)*', prefix):
        raise ValueError(tr('Аддон має непідтримуваний префікс.', 'The addon prefix is unsupported.'))

    stem = re.sub(r'[^a-z0-9_]+', '_', source.stem.lower()).strip('_')[:60] or 'model'
    root = output_folder('models', request.get('output'))
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dayz-model-') as temp:
        stage = Path(temp)
        scratch = stage / 'out'
        scratch.mkdir()
        for index in range(1, 10000):
            name = stem if index == 1 else f'{stem}_{index:02d}'
            destination = root / name
            if not destination.exists():
                break
        else:
            raise FileExistsError(stem)
        log = stage / 'blender.log'
        status = stage / 'progress'
        reported = 1
        with log.open('wb') as output, subprocess.Popen(
            [str(blender), '-b', '-t', '4', '--python-exit-code', '1', '--python',
             str(Path(__file__).with_name('model_blender.py')), '--', str(source), str(scratch),
             str(converter), prefix, name], cwd=stage, stdout=output, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW,
        ) as process:
            deadline = time.monotonic() + 180
            try:
                while True:
                    if status.is_file():
                        for line in status.read_text(encoding='ascii').splitlines():
                            if line in ('2', '3') and int(line) > reported:
                                reported = int(line)
                                progress(reported)
                    if process.poll() is not None:
                        break
                    if time.monotonic() >= deadline:
                        raise TimeoutError(tr('Blender перевищив 3 хвилини.', 'Blender exceeded three minutes.'))
                    time.sleep(.2)
            finally:
                if process.poll() is None:
                    process.kill()
        if process.returncode:
            with log.open('rb') as output:
                output.seek(max(0, log.stat().st_size - 2200))
                raise RuntimeError(output.read().decode('utf-8', errors='replace').strip())
        progress(4)
        model = scratch / f'{name}.p3d'
        from p3d_validation import validate_p3d
        validation = validate_p3d(model)
        source_report = json.loads((scratch / 'validation.json').read_text(encoding='utf-8'))
        for validated, original in zip(validation['lods'], source_report['lods']):
            validated['removedVertices'] = original['removedVertices']
        data = scratch / 'data'
        textures = sorted(path.name for path in data.glob('*.paa') if path.is_file())
        texture_prefix = f'{prefix}\\{name}\\data\\'
        if not set(validation['textures']).issubset(texture_prefix + file for file in textures):
            raise RuntimeError('Missing PAA output for a P3D texture reference')
        validation['warnings'] = ['Collision Geometry and Fire Geometry LODs require authoring before in-game use.']
        (scratch / 'validation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
        shutil.copytree(scratch, destination)
    return {'folder': str(destination), 'model': model.name, 'texture': f'{name}_co.paa',
            'textures': textures, 'prefix': prefix, 'validation': validation}
