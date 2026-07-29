import { makeProject } from "@revideo/core";
import shot1 from "./scenes/shot-1?scene";
import shot2 from "./scenes/shot-2?scene";
import shot3 from "./scenes/shot-3?scene";
import { DEFAULT_MANIFEST } from "./manifest";

export default makeProject({
  scenes: [shot1, shot2, shot3],
  variables: { manifest: DEFAULT_MANIFEST },
});
