import {GeneralMap} from "src/base/GeneralMap.js";
import {ZxNodeKind} from "src/nodes/ZxNodeKind.js"
import {INPUT_NODE, OUTPUT_NODE} from "src/nodes/InputOutputNodes.js"
import {CROSSING_NODE} from "src/nodes/CrossingNode.js"
import {HADAMARD_NODE} from "src/nodes/HadamardNode.js"
import {SPIDER_NODES} from "src/nodes/SpiderNodes.js"
import {POST_SELECTION_NODES} from "src/nodes/PostSelectionNodes.js"


/**
 * @yields {!ZxNodeKind}
 */
function* _iterNodeKinds() {
    yield* SPIDER_NODES;
    yield* POST_SELECTION_NODES;
    yield CROSSING_NODE;
    yield HADAMARD_NODE;
    yield INPUT_NODE;
    yield OUTPUT_NODE;
}

let map = /** @type {!GeneralMap.<!string, !ZxNodeKind>} */ new GeneralMap();
for (let e of _iterNodeKinds()) {
    map.set(e.id, e);
}
const NODES = {
    map: map,
    all: [...map.values()],
    cross: map.get('+'),
    in: map.get('in'),
    out: map.get('out'),
    x: map.get('O'),
    z: map.get('@'),
    white: map.get('O'),
    black: map.get('@'),
    h: map.get('h'),
};

export {NODES}
