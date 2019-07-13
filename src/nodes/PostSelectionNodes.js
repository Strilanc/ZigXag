import {ZxNodeKind} from "src/nodes/ZxNodeKind.js"
import {
    nodeDrawer,
    xBasisEqualityMatrix,
    zBasisEqualityMatrix,
    concatDrawers,
    negHalfPiDrawer,
    halfPiDrawer,
    piDrawer,
} from "src/nodes/Base.js";

/**
 * @param {!boolean} axis
 * @yields {!ZxNodeKind}
 */
function* generatePostSelectionNodes(axis) {
    let nodeDraw = nodeDrawer('red', axis ? 'black' : 'white', 3);
    let textColor = axis ? 'white' : 'black';
    let axisPostChar = axis ? '+' : '0';
    let axisAntiPostChar = axis ? '-' : '1';

    let spiderTensor = phase => {
        let method = axis ? zBasisEqualityMatrix : xBasisEqualityMatrix;
        return dim => method(0, dim, phase);
    };

    yield new ZxNodeKind({
        id: `${axis ? '@' : 'O'}!`,
        description: `postselect\n|${axisPostChar}⟩`,
        diagramReps: axis ? ['@!'] : ['O!', 'o!', '0!'],
        contentDrawer: nodeDraw,
        hotkeys: axis ? ['@', '2'] : ['O', ')', '0'],
        hotkeyShiftMask: true,
        allowedDegrees: [1],
        tensor: spiderTensor(0),
        postSelectStabilizer: axis ? '+X' : '+Z',
    });

    yield new ZxNodeKind({
        id: `${axis ? 'z' : 'x'}!`,
        description: `postselect\n|${axisAntiPostChar}⟩`,
        diagramReps: axis ? ['Z!', 'z!'] : ['X!', 'x!'],
        contentDrawer: concatDrawers(nodeDraw, piDrawer(textColor)),
        hotkeys: axis ? ['Z'] : ['X'],
        hotkeyShiftMask: true,
        allowedDegrees: [1],
        tensor: spiderTensor(Math.PI),
        postSelectStabilizer: axis ? '-X' : '-Z',
    });

    yield new ZxNodeKind({
        id: `${axis ? 's' : 'f'}!`,
        description: `postselect\n|${axis ? 'i' : '-i'}⟩`,
        diagramReps: axis ? ['S!', 's!'] : ['F!', 'f!'],
        contentDrawer: concatDrawers(nodeDraw, halfPiDrawer(textColor)),
        hotkeys: axis ? ['S'] : ['V'],
        hotkeyShiftMask: true,
        allowedDegrees: [1],
        tensor: spiderTensor(Math.PI / 2),
        postSelectStabilizer: axis ? '-Y' : '+Y',
    });

    yield new ZxNodeKind({
        id: `${axis ? 'a' : 'w'}!`,
        description: `postselect\n|${axis ? '-i' : '+i'}⟩`,
        diagramReps: axis ? ['A!', 'a!'] : ['W!', 'w!'],
        contentDrawer: concatDrawers(nodeDraw, negHalfPiDrawer(textColor)),
        hotkeys: axis ? ['A'] : ['W'],
        hotkeyShiftMask: true,
        allowedDegrees: [1],
        tensor: spiderTensor(-Math.PI / 2),
        postSelectStabilizer: axis ? '+Y' : '-Y',
    });
}

const POST_SELECTION_NODES = [...generatePostSelectionNodes(false), ...generatePostSelectionNodes(true)];

export {POST_SELECTION_NODES}
