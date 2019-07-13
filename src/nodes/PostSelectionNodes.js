import {ZxNodeKind} from "src/nodes/ZxNodeKind.js"
import {
    nodeDrawer,
    NO_FIXED_POINTS,
    xBasisEqualityMatrix,
    zBasisEqualityMatrix,
    NO_EDGE_ACTION,
    NO_ACTION_NODE_MEASURER,
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
    let spider = axis ? 'Z' : 'X';

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
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: NO_FIXED_POINTS,
        tensor: spiderTensor(0),
        edgeAction: NO_EDGE_ACTION,
        nodeMeasurer: NO_ACTION_NODE_MEASURER,
        postSelectStabilizer: axis ? '+X' : '+Z',
    });

    yield new ZxNodeKind({
        id: `${axis ? 'z' : 'x'}!`,
        description: `postselect\n|${axisAntiPostChar}⟩`,
        diagramReps: axis ? ['Z!', 'z!'] : ['X!', 'x!'],
        contentDrawer: concatDrawers(nodeDraw, piDrawer(textColor)),
        hotkeys: axis ? ['Z'] : ['X'],
        hotkeyShiftMask: true,
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: NO_FIXED_POINTS,
        tensor: spiderTensor(Math.PI),
        edgeAction: NO_EDGE_ACTION,
        nodeMeasurer: NO_ACTION_NODE_MEASURER,
        postSelectStabilizer: axis ? '-X' : '-Z',
    });

    yield new ZxNodeKind({
        id: `${axis ? 's' : 'f'}!`,
        description: `postselect\n|${axis ? 'i' : '-i'}⟩`,
        diagramReps: axis ? ['S!', 's!'] : ['F!', 'f!'],
        contentDrawer: concatDrawers(nodeDraw, halfPiDrawer(textColor)),
        hotkeys: axis ? ['S'] : ['V'],
        hotkeyShiftMask: true,
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: NO_FIXED_POINTS,
        tensor: spiderTensor(Math.PI / 2),
        edgeAction: NO_EDGE_ACTION,
        nodeMeasurer: NO_ACTION_NODE_MEASURER,
        postSelectStabilizer: axis ? '-Y' : '+Y',
    });

    yield new ZxNodeKind({
        id: `${axis ? 'a' : 'w'}!`,
        description: `postselect\n|${axis ? '-i' : '+i'}⟩`,
        diagramReps: axis ? ['A!', 'a!'] : ['W!', 'w!'],
        contentDrawer: concatDrawers(nodeDraw, negHalfPiDrawer(textColor)),
        hotkeys: axis ? ['A'] : ['W'],
        hotkeyShiftMask: true,
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: NO_FIXED_POINTS,
        tensor: spiderTensor(-Math.PI / 2),
        edgeAction: NO_EDGE_ACTION,
        nodeMeasurer: NO_ACTION_NODE_MEASURER,
        postSelectStabilizer: axis ? '+Y' : '-Y',
    });
}

const POST_SELECTION_NODES = [...generatePostSelectionNodes(false), ...generatePostSelectionNodes(true)];

export {POST_SELECTION_NODES}
