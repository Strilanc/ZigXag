import {ZxNodeKind} from "src/nodes/ZxNodeKind.js";
import {
    nodeDrawer,
    zBasisEqualityMatrix,
} from "src/nodes/Base.js";


let zOnlyFor2 = dim => {
    if (dim !== 1) {
        throw new Error(`Bad input dimension: ${dim}`);
    }
    return zBasisEqualityMatrix(0, 2);
};

const INPUT_NODE = new ZxNodeKind({
    id: 'in',
    description: 'Input node',
    diagramReps: ['!'],
    contentDrawer: ctx => {
        nodeDrawer('black', 'yellow', 1)(ctx);
        ctx.fillStyle = 'black';
        ctx.font = '12px monospace';
        ctx.fillText('in', -7, +2);
    },
    hotkeys: ['i', 'I'],
    hotkeyShiftMask: undefined,
    allowedDegrees: [1],
    tensor: zOnlyFor2,
});

const OUTPUT_NODE = new ZxNodeKind({
    id: 'out',
    description: 'Output node',
    diagramReps: ['?'],
    contentDrawer: ctx => {
        nodeDrawer('black', 'yellow', 1)(ctx);
        ctx.fillStyle = 'black';
        ctx.font = '12px monospace';
        ctx.fillText('out', -9, 2);
    },
    hotkeys: ['u', 'U'],
    hotkeyShiftMask: undefined,
    allowedDegrees: [1],
    tensor: zOnlyFor2,
});

export {INPUT_NODE, OUTPUT_NODE}
