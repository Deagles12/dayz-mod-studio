from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import struct
import json
import math

import bpy
from mathutils import Vector


source, stage, converter, prefix, stem = sys.argv[sys.argv.index("--") + 1:]
stage = Path(stage)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def progress(step):
    with (stage.parent / "progress").open("a", encoding="ascii") as file:
        file.write(f"{step}\n")


def base_color_image(material):
    if material is None or material.node_tree is None:
        raise ValueError("Every mesh surface needs a textured Base Color material.")
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    links = shader.inputs["Base Color"].links if shader else ()
    image = links[0].from_node.image if links and links[0].from_node.type == "TEX_IMAGE" else None
    if image is None or not image.packed_file:
        raise ValueError(f"Material {material.name!r} needs an embedded Base Color texture.")
    return image


def write_png(image, packed, destination):
    if packed.startswith(PNG_SIGNATURE):
        destination.write_bytes(packed)
        return
    original_format = image.file_format
    try:
        image.file_format = "PNG"
        image.save(filepath=str(destination), save_copy=True)
    except RuntimeError as error:
        raise ValueError(f"Blender could not convert the embedded Base Color texture {image.name!r} to PNG.") from error
    finally:
        image.file_format = original_format


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
parts = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data.polygons]
if not parts:
    raise ValueError("Model has no faces.")

world_matrices = [part.matrix_world.copy() for part in parts]
bpy.ops.object.select_all(action="DESELECT")
for part, matrix in zip(parts, world_matrices):
    if part.data.users > 1:
        part.data = part.data.copy()
    uv_layers = part.data.uv_layers
    active_uv = uv_layers.active
    if active_uv is None:
        raise ValueError(f"Mesh {part.name!r} needs UV coordinates.")
    active_name = active_uv.name
    for name in list(uv_layers.keys()):
        if name != active_name:
            uv_layers.remove(uv_layers[name])
    uv_layers[active_name].name = "DayZ UV"
    part.parent = None
    part.matrix_world = matrix
    part.select_set(True)

obj = parts[0]
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(parts) > 1:
    bpy.ops.object.join()

texture_by_data = {}
material_textures = {}
for index in sorted({face.material_index for face in obj.data.polygons}):
    slot = obj.material_slots[index] if index < len(obj.material_slots) else None
    image = base_color_image(slot.material if slot else None)
    packed = image.packed_file.data
    if packed not in texture_by_data:
        suffix = "" if not texture_by_data else f"_{len(texture_by_data) + 1:02d}"
        texture_by_data[packed] = (f"{stem}{suffix}_co", image)
    name, _ = texture_by_data[packed]
    material_textures[index] = f"{prefix}\\{stem}\\data\\{name}.paa".encode("ascii")

obj.data.calc_loop_triangles()
used = {vertex for triangle in obj.data.loop_triangles for vertex in triangle.vertices}
if not used:
    raise ValueError("Model has no faces.")
bounds = [obj.data.vertices[index].co.copy() for index in used]
if not all(math.isfinite(value) for point in bounds for value in point):
    raise ValueError("Model contains non-finite vertex coordinates.")
low = Vector(min(p[i] for p in bounds) for i in range(3))
high = Vector(max(p[i] for p in bounds) for i in range(3))
origin = (high + low) / 2
extent = max(high - low)
if extent <= 0:
    raise ValueError("Model is empty.")

progress(2)
data = stage / "data"
data.mkdir()
with tempfile.TemporaryDirectory(prefix="dayz-paa-") as temp:
    scratch = Path(temp)
    for packed, (texture_name, image) in texture_by_data.items():
        png = scratch / (texture_name + ".png")
        paa = scratch / (texture_name + ".paa")
        write_png(image, packed, png)
        subprocess.run([converter, png.name, paa.name], cwd=scratch, check=True, timeout=60)
        with paa.open("rb") as file:
            if file.read(2) not in (b"\x01\xff", b"\x03\xff", b"\x05\xff"):
                raise ValueError("ImageToPAA did not return a recognized PAA texture.")
        shutil.copyfile(paa, data / paa.name)

progress(3)
lods = []
report = {'lods': []}
for level, budget in ((1, 10000), (2, 4500), (3, 1800)):
    obj.data.calc_loop_triangles()
    count = len(obj.data.loop_triangles)
    if count > budget:
        decimate = obj.modifiers.new("DayZ visual LOD", "DECIMATE")
        decimate.ratio = budget / count
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh = obj.data
    mesh.calc_loop_triangles()
    if not mesh.loop_triangles or len(mesh.loop_triangles) > 10922:
        raise ValueError("The visual LOD exceeds its triangle budget.")
    lods.append((level, mesh.copy()))

with (stage / (stem + ".p3d")).open("wb") as out:
    out.write(struct.pack("<4sII", b"MLOD", 257, len(lods)))
    for level, mesh in lods:
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers.active.data
        used_vertices = sorted({vertex for triangle in mesh.loop_triangles for vertex in triangle.vertices})
        used_corners = sorted({corner for triangle in mesh.loop_triangles for corner in triangle.loops})
        vertex_indices = {old: new for new, old in enumerate(used_vertices)}
        normal_indices = {old: new for new, old in enumerate(used_corners)}
        if max(len(used_vertices), len(used_corners)) > 32767:
            raise ValueError("The visual LOD exceeds the 32767 point/normal budget.")
        report['lods'].append({'resolution': level, 'vertices': len(used_vertices),
                               'removedVertices': len(mesh.vertices) - len(used_vertices),
                               'triangles': len(mesh.loop_triangles), 'normals': len(used_corners)})
        out.write(struct.pack("<4s6I", b"P3DM", 28, 256, len(used_vertices),
                              len(used_corners), len(mesh.loop_triangles), 0))
        for index in used_vertices:
            vertex = mesh.vertices[index]
            x, y, z = vertex.co - origin
            out.write(struct.pack("<3fI", x, z, y, 0))
        for index in used_corners:
            normal = mesh.corner_normals[index]
            x, y, z = normal.vector
            out.write(struct.pack("<3f", -x, -z, -y))
        for triangle in mesh.loop_triangles:
            out.write(struct.pack("<I", 3))
            for vertex, corner in zip(triangle.vertices, triangle.loops):
                u, v = uv[corner].uv
                if not all(math.isfinite(value) for value in (u, v)):
                    raise ValueError("The model contains non-finite UV coordinates.")
                out.write(struct.pack("<IIff", vertex_indices[vertex], normal_indices[corner], u, 1 - v))
            out.write(bytes(20))
            out.write(material_textures[triangle.material_index] + b"\0\0")
        out.write(b"TAGG\x01#EndOfFile#\0")
        out.write(struct.pack("<If", 0, level))

(stage / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
