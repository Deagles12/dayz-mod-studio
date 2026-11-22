import io
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import Mock, patch

from pipeline import Pipeline
from p3d_validation import validate_p3d


class RuntimeValidation(unittest.TestCase):
    def test_protected_client_receives_window_close_without_taskkill(self):
        pipeline = object.__new__(Pipeline)
        pipeline.profiles = Path('profiles')
        pipeline.s = {'port': '2302', 'shared': False}
        pipeline.log = Mock()
        pipeline.ps = Mock(side_effect=[
            '[{"ProcessId":123,"Name":"DayZ_x64.exe","ExecutablePath":null,"CommandLine":null}]',
            '', '', '',
        ])
        with patch('pipeline.subprocess.run') as run:
            pipeline.stop(Path('server.exe'), Path('client.exe'))
            run.assert_not_called()
        self.assertIn('CloseMainWindow', pipeline.ps.call_args_list[1].args[0])

    def test_server_stop_reports_helper_error(self):
        pipeline = object.__new__(Pipeline)
        pipeline.profiles = Path('profiles')
        pipeline.s = {'port': '2302', 'shared': False}
        pipeline.log = Mock()
        pipeline.ps = Mock(return_value='[{"ProcessId":123,"Name":"server.exe","ExecutablePath":"server.exe","CommandLine":"server.exe -profiles=profiles"}]')
        result = Mock(returncode=1, stderr='AttachConsole: WinError 5: Access is denied.', stdout='')
        with patch('pipeline.subprocess.run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'AttachConsole: WinError 5'):
                pipeline.stop(Path('server.exe'), Path('client.exe'))

    def test_server_waits_for_ce_and_rejects_late_vm_exception(self):
        with tempfile.TemporaryDirectory() as directory:
            pipeline = object.__new__(Pipeline)
            pipeline.profiles = Path(directory)
            pipeline.state = Path(directory)
            pipeline.log = Mock()
            pipeline.ps = Mock(return_value='1')
            log = pipeline.profiles / 'server.RPT'
            log.write_text('Module: Mission;\n', encoding='utf-8')
            process = Mock(pid=123)
            process.poll.return_value = None
            now = [0]
            def tick(seconds):
                now[0] += seconds
                with log.open('a') as stream:
                    if now[0] == 2:
                        stream.write('[CE][Hive] :: Init sequence finished.\n')
                    if now[0] == 4:
                        stream.write('Virtual Machine Exception: old workbench\n')
            with patch('pipeline.time.monotonic', side_effect=lambda: now[0]), patch('pipeline.time.sleep', side_effect=tick):
                with self.assertRaisesRegex(RuntimeError, 'Virtual Machine Exception'):
                    pipeline.wait_ready(process, 2302, 60, {})
            self.assertEqual(now[0], 4)

    def test_mission_and_udp_without_ce_never_report_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            pipeline = object.__new__(Pipeline)
            pipeline.profiles = pipeline.state = Path(directory)
            pipeline.log = Mock()
            pipeline.ps = Mock(return_value='1')
            (pipeline.profiles / 'server.RPT').write_text('Module: Mission;\n', encoding='utf-8')
            process = Mock(pid=123)
            process.poll.return_value = None
            now = [0]
            def tick(seconds):
                now[0] += seconds
            with patch('pipeline.time.monotonic', side_effect=lambda: now[0]), patch('pipeline.time.sleep', side_effect=tick):
                with self.assertRaises(TimeoutError):
                    pipeline.wait_ready(process, 2302, 8, {})

    def test_validator_checks_geometry_and_texture_references(self):
        def model(extra=0, bad_index=False, textures=(b'data\\test.paa',)):
            out = io.BytesIO()
            out.write(struct.pack('<4sII', b'MLOD', 257, 3))
            for resolution in (1, 2, 3):
                out.write(struct.pack('<4s6I', b'P3DM', 28, 256, 3 + extra, 3, len(textures), 0))
                out.write(struct.pack('<3fI', 0, 0, 0, 0) * (3 + extra))
                out.write(struct.pack('<3f', 0, 1, 0) * 3)
                for texture in textures:
                    out.write(struct.pack('<I', 3))
                    for index in range(3):
                        out.write(struct.pack('<IIff', 100 if bad_index else index, index, 0, 0))
                    out.write(bytes(20) + texture + b'\0\0')
                out.write(b'TAGG\x01#EndOfFile#\0')
                out.write(struct.pack('<If', 0, resolution))
            return out.getvalue()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.p3d'
            path.write_bytes(model())
            self.assertEqual(len(validate_p3d(path)['lods']), 3)
            path.write_bytes(model(textures=(b'data\\test.paa', b'data\\second.paa')))
            report = validate_p3d(path)
            self.assertEqual(report['materials'], 2)
            self.assertEqual(report['textures'], ['data\\second.paa', 'data\\test.paa'])
            for content in (model(extra=1), model(bad_index=True), model(textures=(b'invalid.png',)), model()[:-5]):
                path.write_bytes(content)
                with self.assertRaises(ValueError):
                    validate_p3d(path)
