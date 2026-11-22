"""Validate the MLOD subset emitted by Studio before publishing an export."""
import math
import struct


def validate_p3d(path):
    with path.open('rb') as stream:
        def read(size):
            data = stream.read(size)
            if len(data) != size:
                raise ValueError('Truncated P3D')
            return data

        def unpack(format):
            return struct.unpack(format, read(struct.calcsize(format)))

        def string():
            result = bytearray()
            while len(result) < 4096:
                value = read(1)
                if value == b'\0':
                    return result.decode('ascii')
                result.extend(value)
            raise ValueError('Invalid P3D string')

        if unpack('<4sII') != (b'MLOD', 257, 3):
            raise ValueError('Expected three visual MLOD LODs')
        lods = []
        model_textures = set()
        for expected in (1, 2, 3):
            magic, major, minor, points, normals, faces, flags = unpack('<4s6I')
            if (magic, major, minor, flags) != (b'P3DM', 28, 256, 0):
                raise ValueError('Invalid LOD header')
            if not 0 < points <= 32767 or not 0 < normals <= 32767 or not 0 < faces <= 10922:
                raise ValueError('P3D exceeds visual LOD limits')
            for _ in range(points):
                x, y, z, _ = unpack('<3fI')
                if not all(map(math.isfinite, (x, y, z))):
                    raise ValueError('Invalid vertex coordinates')
            for _ in range(normals):
                if not all(map(math.isfinite, unpack('<3f'))):
                    raise ValueError('Invalid normal')
            used = set()
            textures = set()
            for _ in range(faces):
                if unpack('<I')[0] != 3:
                    raise ValueError('Expected triangular faces')
                for _ in range(3):
                    vertex, normal, u, v = unpack('<IIff')
                    if vertex >= points or normal >= normals or not all(map(math.isfinite, (u, v))):
                        raise ValueError('Invalid face indices or UVs')
                    used.add(vertex)
                read(20)
                textures.add(string())
                if string():
                    raise ValueError('Unexpected material reference')
            if len(used) != points or any(not texture.endswith('.paa') for texture in textures):
                raise ValueError('Unused vertices or invalid texture assignment')
            model_textures.update(textures)
            if read(4) != b'TAGG' or read(1) != b'\x01' or string() != '#EndOfFile#':
                raise ValueError('Invalid LOD tags')
            length, resolution = unpack('<If')
            if length != 0 or resolution != expected:
                raise ValueError('Invalid visual LOD resolution')
            lods.append(dict(resolution=resolution, vertices=points, normals=normals, triangles=faces))
        if stream.read(1):
            raise ValueError('Unexpected P3D trailing data')
    return {'lods': lods, 'uv': True, 'materials': len(model_textures), 'collision': False,
            'textures': sorted(model_textures)}
