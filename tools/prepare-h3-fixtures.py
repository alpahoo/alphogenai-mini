"""Extract only pure graph-building definitions from the existing lab; never import Modal."""
import ast
import json
import sys
from pathlib import Path

lab = Path(sys.argv[1])
tree = ast.parse(lab.read_text(encoding="utf-8-sig"))
names = {"TURBO_MODES", "TE_FILES", "frames_for", "build_workflow"}
selected = [n for n in tree.body if (
    isinstance(n, ast.FunctionDef) and n.name in names
) or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets))]
namespace = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), str(lab), "exec"), namespace)
out = Path(__file__).resolve().parents[1] / "workflows/comfy/templates/minimax-h3"
out.mkdir(parents=True, exist_ok=True)
for variant, turbo, first in [("t2v", "v4", None), ("i2v", "v4", "first_frame.png"), ("t2v_full", "none", None)]:
    graph = namespace["build_workflow"]({"name": "output", "prompt": "A cinematic scene", "width": 480,
                                        "height": 832, "seconds": 5, "seed": 1}, first, turbo, "int8")
    # Explicit delivery codec, independent of platform auto selection.
    graph["15"]["inputs"].update({"format": "mp4", "codec": "h264", "filename_prefix": "output"})
    (out / f"graph.{variant}.api.json").write_text(json.dumps(graph, indent=2) + "\n", encoding="utf-8")
print("Extracted three API graphs; no lab imports, GPU calls or model changes.")
