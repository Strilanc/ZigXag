// import {CliffordRotation} from "src/sim/CliffordRotation.js";
//
// class ZxNodeKind {
//     /**
//      * @param {!{
//      *     id: !string,
//      *     description: !string,
//      *     contentDrawer: !function(ctx: !CanvasRenderingContext2D, args: !ZxNodeDrawArgs),
//      *     diagramReps: (undefined|!Array.<!string>),
//      *     hotkeys: !Array.<!string>,
//      *     hotkeyShiftMask: (undefined|!boolean),
//      *     mouseHotkey?: (undefined|!string),
//      *     allowedDegrees: !Array.<!int>,
//      * }} attributes
//      */
//     constructor(attributes) {
//         this.id = attributes.id;
//         this.description = attributes.description;
//         this.contentDrawer = attributes.contentDrawer;
//         this.diagramReps = attributes.diagramReps || [this.id];
//         this.hotkeys = attributes.hotkeys;
//         this.hotkeyShiftMask = attributes.hotkeyShiftMask;
//         this.mouseHotkey = attributes.mouseHotkey;
//         this.allowedDegrees = attributes.allowedDegrees;
//         this.tensor = attributes.tensor;
//         this.postSelectStabilizer = attributes.postSelectStabilizer || undefined;
//     }
// }
//
// class ZxNodeDrawArgs {
//     /**
//      * @param {!ZxGraph} graph
//      * @param {!ZxNode} pos
//      */
//     constructor(graph, pos) {
//         this.graph = graph;
//         this.pos = pos;
//     }
// }
//
// export {ZxNodeKind, ZxNodeDrawArgs}
