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
 * @yields {!ZxNodeKind}
 */
function* generatePostSelectionNodes() {
    for (let axis of [false, true]) {
        let nodeDraw = nodeDrawer(
            'red',
            axis ? 'black' : 'white',
            3);
        let textColor = axis ? 'white' : 'black';
        let axisPostChar = axis ? '+' : '0';
        let axisAntiPostChar = axis ? '-' : '1';
        let spider = axis ? 'Z' : 'X';
        let oppSpider = axis ? 'X' : 'Z';
        let desc = (selected, modifier, sign, gate) => `postselect\n|${selected}⟩`;

        let spiderTensor = phase => {
            let method = axis ? zBasisEqualityMatrix : xBasisEqualityMatrix;
            return dim => method(0, dim, phase);
        };

        yield new ZxNodeKind({
            id: `${axis ? '@' : 'O'}!`,
            description: desc(axisPostChar, '', '', 'Identity'),
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
            description: desc(axisAntiPostChar, 'Flipped', '-', spider),
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
            description: desc(axis ? 'i' : '-i', 'Phased', `-i${spider}0·`, axis ? 'S' : 'H·S·H'),
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
            description: desc(axis ? '-i' : 'i', 'Backphased', `i${spider}0·`, axis ? 'S†' : 'H·S†·H'),
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
}

const POST_SELECTION_NODES = [...generatePostSelectionNodes()];

export {POST_SELECTION_NODES}
