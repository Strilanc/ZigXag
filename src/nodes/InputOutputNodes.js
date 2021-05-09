// import {ZxNodeKind} from "src/nodes/ZxNodeKind.js";
// import {
//     nodeDrawer,
//     zBasisEqualityMatrix,
// } from "src/nodes/Base.js";
//
//
// let zOnlyFor2 = dim => {
//     if (dim !== 1) {
//         throw new Error(`Bad input dimension: ${dim}`);
//     }
//     return zBasisEqualityMatrix(0, 2);
// };
//
// let drawerForText = (text, flipSign) => (ctx, args) => {
//     let edges = args.graph.activeUnitEdgesOf(args.pos);
//     let opp = edges.length > 0 ? edges[0].opposite(args.pos) : args.pos;
//     let spanSign;
//     let inverseSpanSign ;
//     if (edges.length === 0) {
//         ctx.translate(0, 6);
//         spanSign = +1;
//         inverseSpanSign = -1;
//     } else if (opp.y !== args.pos.y) {
//         ctx.rotate(Math.PI/2 * flipSign * (opp.y > args.pos.y ? 1 : -1));
//         spanSign = Math.abs(opp.y - args.pos.y) * flipSign;
//         inverseSpanSign = 0;
//     } else {
//         spanSign = opp.x - args.pos.x;
//         inverseSpanSign = 0;
//     }
//
//     ctx.fillStyle = 'black';
//     ctx.font = 'bold 16px monospace';
//     let r = ctx.measureText(text).width/2;
//     ctx.fillText(text, -r, -4);
//
//     ctx.beginPath();
//     ctx.lineWidth = 1;
//     ctx.strokeStyle = 'black';
//     ctx.moveTo(-r * inverseSpanSign, 0);
//     ctx.lineTo(-r * spanSign, 0);
//     ctx.stroke();
// };
//
// const INPUT_NODE = new ZxNodeKind({
//     id: 'in',
//     description: 'Input node',
//     diagramReps: ['!'],
//     contentDrawer: drawerForText('in', +1),
//     hotkeys: ['i', 'I'],
//     hotkeyShiftMask: undefined,
//     allowedDegrees: [1],
//     tensor: zOnlyFor2,
// });
//
// const OUTPUT_NODE = new ZxNodeKind({
//     id: 'out',
//     description: 'Output node',
//     diagramReps: ['?'],
//     contentDrawer: drawerForText('out', -1),
//     hotkeys: ['u', 'U'],
//     hotkeyShiftMask: undefined,
//     allowedDegrees: [1],
//     tensor: zOnlyFor2,
// });
//
// export {INPUT_NODE, OUTPUT_NODE}
