"""Builds the studio's materials as assets, so the repository only holds text.

Run by Scripts/setup.ps1 through the editor's Python commandlet:
    UnrealEditor-Cmd.exe QuestwrightStudio.uproject -run=pythonscript -script=Scripts/setup_content.py

Makes, under /Game/Studio:
    M_Gear      lit material driven by parameters (base colour, metal, roughness, specular, sheen, glow)
    M_Backdrop  unlit two-sided gradient for the sky dome behind the character
    PP_Painted  post process: Kuwahara brush strokes, ink outlines, paper grain (the 2D painted style)
    PP_Toon     post process: banded light and ink outlines (the stylised WoW-like style)
"""

import unreal

FOLDER = "/Game/Studio"
MEL = unreal.MaterialEditingLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()


def enum_member(enum, *parts):
    """The enum member whose name contains every part, so the script survives renames between versions."""
    for name in dir(enum):
        if all(p in name for p in parts):
            return getattr(enum, name)
    raise RuntimeError(f"No {enum.__name__} member with {parts}: {[n for n in dir(enum) if n.isupper()]}")


def new_material(name):
    path = f"{FOLDER}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    return TOOLS.create_asset(name, FOLDER, unreal.Material, unreal.MaterialFactoryNew())


def node(mat, cls, x, y, **props):
    e = MEL.create_material_expression(mat, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def scalar(mat, name, value, x, y):
    return node(mat, unreal.MaterialExpressionScalarParameter, x, y, parameter_name=name, default_value=value)


def vector(mat, name, rgb, x, y):
    return node(mat, unreal.MaterialExpressionVectorParameter, x, y, parameter_name=name, default_value=unreal.LinearColor(*rgb, 1.0))


def custom(mat, code, inputs, x, y, out=None):
    out = out or enum_member(unreal.CustomMaterialOutputType, "FLOAT3")
    c = node(mat, unreal.MaterialExpressionCustom, x, y, code=code, output_type=out)
    pins = []
    for name in inputs:
        pin = unreal.CustomInput()
        pin.set_editor_property("input_name", name)
        pins.append(pin)
    c.set_editor_property("inputs", pins)
    return c


def finish(mat):
    MEL.layout_material_expressions(mat)
    MEL.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    unreal.log(f"Questwright: built {mat.get_path_name()}")


def gear():
    m = new_material("M_Gear")
    m.set_editor_property("used_with_skeletal_mesh", True)  # The body's skin uses it too.
    base = vector(m, "BaseColor", (0.72, 0.74, 0.78), -800, -200)
    metal = scalar(m, "Metallic", 1.0, -800, -100)
    rough = scalar(m, "Roughness", 0.3, -800, 0)
    spec = scalar(m, "Specular", 0.5, -800, 100)
    sheen = vector(m, "Sheen", (0, 0, 0), -800, 400)
    glow = vector(m, "Emissive", (0, 0, 0), -800, 500)
    fresnel = node(m, unreal.MaterialExpressionFresnel, -560, 400, exponent=3.0)
    rim = node(m, unreal.MaterialExpressionMultiply, -360, 420)
    MEL.connect_material_expressions(fresnel, "", rim, "A")
    MEL.connect_material_expressions(sheen, "", rim, "B")
    emissive = node(m, unreal.MaterialExpressionAdd, -200, 450)
    MEL.connect_material_expressions(rim, "", emissive, "A")
    MEL.connect_material_expressions(glow, "", emissive, "B")
    P = unreal.MaterialProperty
    MEL.connect_material_property(base, "", P.MP_BASE_COLOR)
    MEL.connect_material_property(metal, "", P.MP_METALLIC)
    MEL.connect_material_property(rough, "", P.MP_ROUGHNESS)
    MEL.connect_material_property(spec, "", P.MP_SPECULAR)
    MEL.connect_material_property(emissive, "", P.MP_EMISSIVE_COLOR)
    finish(m)


def backdrop():
    m = new_material("M_Backdrop")
    m.set_editor_property("shading_model", enum_member(unreal.MaterialShadingModel, "UNLIT"))
    m.set_editor_property("two_sided", True)
    top = vector(m, "Top", (0.1, 0.14, 0.3), -700, -100)
    bottom = vector(m, "Bottom", (0.01, 0.01, 0.02), -700, 0)
    screen = node(m, unreal.MaterialExpressionScreenPosition, -700, 120)
    code = """
float t = saturate(UV.y);
float3 c = lerp(Top.rgb, Bottom.rgb, t * t * (3 - 2 * t));
float2 d = (UV - float2(0.62, 0.42)) * float2(1.2, 1.0);
float v = 1 - saturate(dot(d, d) * 1.4);
return c * (0.45 + 0.75 * v);
"""
    c = custom(m, code, ["UV", "Top", "Bottom"], -400, 0)
    MEL.connect_material_expressions(screen, "ViewportUV", c, "UV")
    MEL.connect_material_expressions(top, "", c, "Top")
    MEL.connect_material_expressions(bottom, "", c, "Bottom")
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    finish(m)


# Shared HLSL: ink lines where depth or surface direction jumps. Scene texture ids:
# 1 scene depth (cm), 8 world normal, 14 post process input 0.
EDGES = """
float d0 = SceneTextureLookup(uv, 1, false).r;
float dl = SceneTextureLookup(uv + float2(-W, 0) * Px, 1, false).r;
float dr = SceneTextureLookup(uv + float2( W, 0) * Px, 1, false).r;
float du = SceneTextureLookup(uv + float2(0, -W) * Px, 1, false).r;
float dd = SceneTextureLookup(uv + float2(0,  W) * Px, 1, false).r;
float depthEdge = saturate((abs(dl + dr - 2 * d0) + abs(du + dd - 2 * d0)) / max(d0, 1) * 30 - 0.15);
float3 n0 = SceneTextureLookup(uv, 8, false).xyz;
float3 nl = SceneTextureLookup(uv + float2(-W, 0) * Px, 8, false).xyz;
float3 nu = SceneTextureLookup(uv + float2(0, -W) * Px, 8, false).xyz;
float normalEdge = saturate((length(n0 - nl) + length(n0 - nu)) * 1.2 - 0.35);
float onModel = d0 < 2500 ? 1 : 0;
float edge = saturate(max(depthEdge, normalEdge)) * onModel;
"""


def post_process(name, location_parts, body, params):
    m = new_material(name)
    m.set_editor_property("material_domain", enum_member(unreal.MaterialDomain, "POST_PROCESS"))
    m.set_editor_property("blendable_location", enum_member(unreal.BlendableLocation, *location_parts))
    # A scene texture node lets the custom code read the scene, and gives the texel size.
    scene = node(m, unreal.MaterialExpressionSceneTexture, -800, -200,
                 scene_texture_id=enum_member(unreal.SceneTextureId, "POST_PROCESS_INPUT0"))
    names = ["Px", "Seen"] + [p[0] for p in params]
    c = custom(m, "float2 uv = GetDefaultSceneTextureUV(Parameters, 14);\n" + body, names, -300, 0)
    MEL.connect_material_expressions(scene, "InvSize", c, "Px")
    MEL.connect_material_expressions(scene, "Color", c, "Seen")
    for i, (pname, value) in enumerate(params):
        MEL.connect_material_expressions(scalar(m, pname, value, -800, i * 100), "", c, pname)
    MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    finish(m)


PAINTED = """
// Kuwahara: each pixel takes the mean of the calmest of four neighbouring squares,
// which flattens detail into brush-like patches while keeping edges.
int r = (int)clamp(Radius, 1, 10);
float n = (r + 1) * (r + 1);
float3 m0 = 0, m1 = 0, m2 = 0, m3 = 0, s0 = 0, s1 = 0, s2 = 0, s3 = 0;
[loop] for (int j = 0; j <= r; j++)
{
    [loop] for (int i = 0; i <= r; i++)
    {
        float3 a = SceneTextureLookup(uv + float2(-i, -j) * Px, 14, false).rgb; m0 += a; s0 += a * a;
        float3 b = SceneTextureLookup(uv + float2( i, -j) * Px, 14, false).rgb; m1 += b; s1 += b * b;
        float3 c = SceneTextureLookup(uv + float2(-i,  j) * Px, 14, false).rgb; m2 += c; s2 += c * c;
        float3 d = SceneTextureLookup(uv + float2( i,  j) * Px, 14, false).rgb; m3 += d; s3 += d * d;
    }
}
m0 /= n; m1 /= n; m2 /= n; m3 /= n;
float3 v0 = abs(s0 / n - m0 * m0), v1 = abs(s1 / n - m1 * m1), v2 = abs(s2 / n - m2 * m2), v3 = abs(s3 / n - m3 * m3);
float e0 = v0.r + v0.g + v0.b, e1 = v1.r + v1.g + v1.b, e2 = v2.r + v2.g + v2.b, e3 = v3.r + v3.g + v3.b;
float3 col = m0; float best = e0;
if (e1 < best) { best = e1; col = m1; }
if (e2 < best) { best = e2; col = m2; }
if (e3 < best) { best = e3; col = m3; }
float W = 2.0;
""" + EDGES + """
// Watercolour-ish pooling at edges, ink lines, and paper grain.
float2 p = uv / Px;
float grain = frac(sin(dot(floor(p / 2), float2(12.9898, 78.233))) * 43758.5453);
float fibre = frac(sin(dot(floor(p / float2(9, 2)), float2(39.346, 11.135))) * 24634.6345);
float paper = 0.93 + 0.05 * grain + 0.02 * fibre;
col = lerp(col, col * 0.82, saturate(edge * 2));
col = lerp(col, float3(0.17, 0.12, 0.09), edge * Ink);
return col * paper + 0 * Seen.rgb;
"""

TOON = """
float3 sc = SceneTextureLookup(uv, 14, false).rgb;
float W = 1.0;
""" + EDGES + """
if (onModel < 0.5) return sc + 0 * Seen.rgb;
// Light as a share of the surface colour, snapped into bands, then softened a little.
float3 bc = SceneTextureLookup(uv, 5, false).rgb;
float lum = dot(sc, float3(0.299, 0.587, 0.114));
float blum = max(dot(bc, float3(0.299, 0.587, 0.114)), 0.03);
float shade = min(lum / blum, 1.6);
float q = floor(shade * Bands + 0.35) / Bands;
q = lerp(q, shade, 0.2);
float3 col = bc * q;
// Keep highlights and reflections that the bands would flatten.
col = lerp(col, sc, saturate((shade - 1.4) * 2));
col = lerp(col, sc, 0.15);
col = lerp(col, float3(0.02, 0.025, 0.05) * lum, edge * Ink);
return col;
"""


def level():
    """An empty map: the studio builds its whole scene in code."""
    path = f"{FOLDER}/L_Studio"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if levels.new_level(path) and levels.save_current_level():
        unreal.log(f"Questwright: built {path}")
    else:
        raise RuntimeError(f"Could not create {path}")


unreal.EditorAssetLibrary.make_directory(FOLDER)
level()
gear()
backdrop()
post_process("PP_Painted", ("SCENE_COLOR", "AFTER_TONEMAPPING"), PAINTED, [("Radius", 8.0), ("Ink", 0.9)])
post_process("PP_Toon", ("SCENE_COLOR", "AFTER_DOF"), TOON, [("Bands", 3.0), ("Ink", 0.9)])
unreal.log("Questwright: studio content ready")
