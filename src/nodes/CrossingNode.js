// import {PauliProduct} from "src/sim/PauliProduct.js";
// import {ZxNodeKind} from "src/nodes/ZxNodeKind.js"
//
// const CROSSING_NODE = new ZxNodeKind({
//     id: '+',
//     description: 'Crosser node',
//     diagramReps: ['+', '-', '|'],
//     contentDrawer: ctx => {
//         // Empty space.
//     },
//     hotkeys: [],
//     hotkeyShiftMask: undefined,
//     allowedDegrees: [2, 4],
//     fixedPoints: deg => {
//         if (deg === 4) {
//             return [
//                 // HACK: This implicitly depends on the sorting order of edges being [left, top, down, right].
//                 PauliProduct.fromString('X..X'),
//                 PauliProduct.fromString('Z..Z'),
//                 PauliProduct.fromString('.XX.'),
//                 PauliProduct.fromString('.ZZ.'),
//             ];
//         }
//
//         if (deg === 2) {
//             return [PauliProduct.fromString('XX'), PauliProduct.fromString('ZZ')];
//         }
//
//         throw new Error('Invalid degree.');
//     },
//     tensor: () => {
//         throw new Error('Crossing node tensor must be handled specially.');
//     },
//     nodeMeasurer: () => {
//         throw new Error('Crossing node tensor must be handled specially.');
//     },
// });
//
// export {CROSSING_NODE}
