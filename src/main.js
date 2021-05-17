/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
import {Rect} from "src/base/Rect.js";
import {Point} from "src/base/Point.js";
import {stim} from "src/ext/stim.js"

window.onerror = function(msg, url, line, col, error) {
    document.getElementById('err_msg').innerText = `${describe(msg)}\n${error.stack}`;
    document.getElementById('err_line').innerText = describe(line);
    document.getElementById('err_time').innerText = '' + new Date().getMilliseconds();
    if (error instanceof DetailedError) {
        document.getElementById('err_gen').innerText = describe(error.details);
    }
};

import {Revision} from "src/base/Revision.js";
import {Painter} from "src/Painter.js";
import {Seq, seq} from "src/base/Seq.js";
import {
    Edit,
    removeEdgeEdit,
    removeNodeEdit,
    maybeRemoveConnectingPathEdit,
    maybeContractNodeEdit,
    maybeRemoveEdgeModifier,
    maybeDragNodeEdit,
    setElementKindEdit,
} from "src/edit.js";
import {makeNodeRingMenu} from "src/ui/RingMenu.js"
import {ObservableValue} from "src/base/Obs.js";
import {initUndoRedo} from "src/ui/UndoRedo.js";
import {initUrlSync} from "src/ui/Url.js";
import {initClear} from "src/ui/Clear.js";
import {RasterGraph} from "src/sim/raster_graph.js";

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
const canvasDiv = /** @type {!HTMLDivElement} */ document.getElementById('main-canvas-div');
const stabilizersDiv = /** @type {!HTMLDivElement} */ document.getElementById('stabilizers-div');

let selection = new RasterGraph();
let mouseX = undefined;
let mouseY = undefined;
let curCtrlKey = false;
let curAltKey = false;
let curShiftKey = false;
let curMouseButton = undefined;
let mouseDownX = undefined;
let mouseDownY = undefined;
let menuNode = undefined;

const DEFAULT_SCALE = 10;

let view = {
    left: -1,
    top: -1,
    zoom: 30,
}

let revision = new Revision([''], 0, false);
let emulatedClipboardContents = undefined;

let obsIsAnyOverlayShowing = new ObservableValue(false);
initUrlSync(revision);
// initExports(revision, obsCurrentEval, obsIsAnyOverlayShowing.observable());
initUndoRedo(revision, obsIsAnyOverlayShowing);
initClear(revision, obsIsAnyOverlayShowing.observable());
revision.commit(RasterGraph.fromString(`
[in]-Z-[out]
 ___ |    ________  _________/
[in]-X-H-[X(pi/2)]-[X(-pi/2)]-[X(pi)]-[Z(pi/2)]-[Z(-pi/2)]-[Z(pi)]-[out]
    `).toString(false));
// obsExportsIsShowing.
//     whenDifferent().
//     subscribe(e => {
//         obsIsAnyOverlayShowing.set(e);
//         canvasDiv.tabIndex = e ? -1 : 0;
//     });

// /**
//  * @param {!DisplayedZxGraph} displayed
//  * @param {!ZxNode} node
//  * @returns {![!number, !number]}
//  */
// function nodeToMenuXy(displayed, node) {
//     let [x, y] = displayed.nodeToXy(node);
//     x = Math.max(x, 170);
//     y = Math.max(y, 140);
//     return [x, y];
// }

// /**
//  * @param {!CanvasRenderingContext2D} ctx
//  * @param {!DisplayedZxGraph} displayed
//  */
// function drawGraph(ctx, displayed) {
//     let graph = displayed.graph;
//     for (let edge of graph.edges.keys()) {
//         drawEdge(ctx, displayed, edge);
//     }
//     for (let node of graph.nodes.keys()) {
//         if (graph.kind(node) !== '+') {
//             drawNode(ctx, displayed, node);
//         }
//     }
// }


function drawSpider(x, y, h, ctx, kind, quarter_turns) {
    let fontColor;
    if (kind === 'X') {
        ctx.fillStyle = '#FFF';
        fontColor = '#000';
    } else if (kind === 'Z') {
        ctx.fillStyle = '#000';
        fontColor = '#FFF';
    } else {
        throw new Error("Unknown spider type.");
    }
    ctx.arc(x, y, h, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (quarter_turns !== 0) {
        ctx.fillStyle = fontColor;
        ctx.textAlign = 'center';
        if (quarter_turns === 2) {
            ctx.font = `${h*2}px monospace`;
            ctx.textBaseline = 'middle';
            ctx.fillText('π', x, y, h * 2);
        } else {
            ctx.font = `${h*1.1}px monospace`;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText((quarter_turns === 3 ? '-' : '') + 'π', x, y - h / 10, h * 2);
            ctx.font = `${h}px monospace`;
            ctx.textBaseline = 'top';
            ctx.fillText('2', x, y, h * 2);
            ctx.beginPath();
            ctx.moveTo(x - h*0.6, y);
            ctx.lineTo(x + h*0.6, y);
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = fontColor;
            ctx.stroke();
        }
    }
}

function isSelectionRectHighlightingGraphLocation(x, y) {
    if (selectionStart === undefined || selectionEnd === undefined) {
        return false;
    }
    let selRect = new Rect(
        Math.min(selectionStart.x, selectionEnd.x),
        Math.min(selectionStart.y, selectionEnd.y),
        Math.abs(selectionStart.x - selectionEnd.x),
        Math.abs(selectionStart.y - selectionEnd.y));
    return selRect.containsPoint(new Point(x, y));
}

function draw() {
    const s = DEFAULT_SCALE;
    const h = s * 0.5;

    // let displayed = currentlyDisplayedZxGraph;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - canvasDiv.offsetTop - 5;

    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.clearRect(0, 0, 100000, 100000);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 10000, 10000);
    let state = RasterGraph.fromString(revision.peekActiveCommit());

    ctx.save();
    ctx.scale(view.zoom / s, view.zoom / s);
    ctx.translate(-view.left * DEFAULT_SCALE, -view.top * DEFAULT_SCALE);

    let selRect = new Rect(0, 0, 0, 0);
    if (selectionStart !== undefined && selectionEnd !== undefined) {
        selRect = new Rect(
            Math.min(selectionStart.x, selectionEnd.x),
            Math.min(selectionStart.y, selectionEnd.y),
            Math.abs(selectionStart.x - selectionEnd.x),
            Math.abs(selectionStart.y - selectionEnd.y));
    }

    try {
        for (let [gx, gy, v] of state.entries()) {
            let x = gx * s;
            let y = gy * s;
            ctx.save();
            if (isSelectionRectHighlightingGraphLocation(gx, gy)) {
                ctx.strokeStyle = 'blue';
            }
            ctx.beginPath();
            switch (v) {
                case '-':
                    ctx.moveTo(x - s, y);
                    ctx.lineTo(x + s, y);
                    ctx.stroke();
                    break;
                case '|':
                    ctx.moveTo(x, y - s);
                    ctx.lineTo(x, y + s);
                    ctx.stroke();
                    break;
                case '\\':
                    ctx.moveTo(x - s, y - s);
                    ctx.lineTo(x + s, y + s);
                    ctx.stroke();
                    break;
                case '/':
                    ctx.moveTo(x + s, y - s);
                    ctx.lineTo(x - s, y + s);
                    ctx.stroke();
                    break;
            }
            ctx.restore();
        }

        for (let [gx, gy, v] of state.entries()) {
            let x = gx * s;
            let y = gy * s;
            ctx.save();
            ctx.beginPath();
            switch (v) {
                case '-':
                    break;
                case '|':
                    break;
                case '\\':
                    break;
                case '/':
                    break;
                case 'X':
                    drawSpider(x, y, h, ctx, 'X', 0);
                    break;
                case 'X(pi/2)':
                    drawSpider(x, y, h, ctx, 'X', 1);
                    break;
                case 'X(pi)':
                    drawSpider(x, y, h, ctx, 'X', 2);
                    break;
                case 'X(-pi/2)':
                    drawSpider(x, y, h, ctx, 'X', 3);
                    break;
                case 'Z':
                    drawSpider(x, y, h, ctx, 'Z', 0);
                    break;
                case 'Z(pi/2)':
                    drawSpider(x, y, h, ctx, 'Z', 1);
                    break;
                case 'Z(pi)':
                    drawSpider(x, y, h, ctx, 'Z', 2);
                    break;
                case 'Z(-pi/2)':
                    drawSpider(x, y, h, ctx, 'Z', 3);
                    break;
                case 'H':
                    ctx.fillStyle = 'yellow';
                    ctx.rect(x - h, y - h, s, s);
                    ctx.fill();
                    ctx.stroke();
                    break;
                case 'in':
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(x - h, y - h, s, s);
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `${s}px monospace`;
                    ctx.fillText('in', x, y, s);
                    break;
                case 'out':
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(x - h, y - h, s, s);
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `${s}px monospace`;
                    ctx.fillText('out', x, y, s);
                    break;
                default:
                    ctx.fillStyle = 'red';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `${s}px monospace`;
                    ctx.fillText('?', x, y, s);
                    break;
            }
            ctx.restore();
        }

        for (let [gx, gy, v] of state.entries()) {
            let x = gx * s;
            let y = gy * s;
            ctx.save();
            ctx.beginPath();
            let b = isSelectionRectHighlightingGraphLocation(gx, gy);
            let b2 = selection.get(gx, gy) === v;
            if (b) {
                ctx.globalAlpha *= 0.5;
                ctx.fillStyle = 'blue';
                ctx.fillRect(x - h, y - h, s, s);
            } else if (b2) {
                ctx.globalAlpha *= 0.2;
                ctx.fillStyle = 'black';
                ctx.fillRect(x - h, y - h, s, s);
            }
            ctx.restore();
        }

        // if (menuNode === undefined) {
        //     drawFocus(ctx, displayed);
        // }
        // try {
        //     drawResults(ctx, displayed);
        //     drawFadedNearbyRegion(ctx, displayed);
        // } finally {
        //     drawGraph(ctx, displayed);
        //     if (menuNode === undefined) {
        //         drawPossibleEdit(ctx, displayed);
        //     }
        // }
        //
        // if (menuNode !== undefined) {
        //     ctx.save();
        //     ctx.globalAlpha *= 0.85;
        //     ctx.beginPath();
        //     let [nx, ny] = displayed.nodeToXy(menuNode);
        //     ctx.arc(nx, ny, 1000, 0, 2*Math.PI);
        //     ctx.lineWidth = 1950;
        //     ctx.strokeStyle = 'white';
        //     ctx.stroke();
        //     ctx.restore();
        //
        //     let [x, y] = nodeToMenuXy(displayed, menuNode);
        //     makeNodeRingMenu().draw(ctx, x, y, curShiftKey, mouseX, mouseY);
        // }
    } finally {
        ctx.restore();
    }

    ctx.save();
    if (selectionEnd !== undefined && selectionStart !== undefined) {
        ctx.beginPath();
        let {x: x1, y: y1} = graph_to_screen_pos(selectionStart.x, selectionStart.y);
        let {x: x2, y: y2} = graph_to_screen_pos(selectionEnd.x, selectionEnd.y);
        ctx.rect(x1, y1, x2 - x1, y2 - y1);
        ctx.strokeStyle = '#39E';
        ctx.fillStyle = '#39E';
        ctx.stroke();
        ctx.globalAlpha *= 0.5;
        ctx.fill();
    }
    ctx.restore();
}

let keyListeners = /** @type {!Map.<!int, !Array.<!function(!KeyboardEvent)>>} */ new Map();

/**
 * @param {!MouseEvent} ev
 * @param {!HTMLElement} element
 * @returns {![!number, !number]}
 */
function eventPosRelativeTo(ev, element) {
    let b = element.getBoundingClientRect();
    return [ev.clientX - b.left, ev.clientY - b.top];
}


/**
 * @param {!DisplayedZxGraph} displayedAtCreationTime
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeExtendAlongEdgeEdit(displayedAtCreationTime, edge) {
    let graph = displayedAtCreationTime.graph;
    if (graph.edges.has(edge)) {
        return undefined;
    }

    let [n1, n2] = edge.nodes();
    let b1 = graph.nodes.has(n1);
    let b2 = graph.nodes.has(n2);
    if (b1 === b2) {
        return undefined;
    }
    if (b2) {
        [n1, n2] = [n2, n1];
    }

    return new Edit(
        () => `extend along ${edge}`,
        graph => {
            let kind = graph.nodes.get(n1);
            if (kind === 'in' || kind === 'out') {
                graph.nodes.set(n1, 'O');
            }
            graph.nodes.set(n2, kind);
            graph.edges.set(edge, '-');
        },
        (displayed, ctx) => {
            let [x1, y1] = displayed.nodeToXy(n1);
            let [x2, y2] = displayed.nodeToXy(n2);
            let dx = x2 - x1;
            let dy = y2 - y1;
            let d = Math.sqrt(dx * dx + dy * dy);
            dx /= d;
            dy /= d;
            let angle = Math.atan2(dy, dx);
            let painter = new Painter(ctx);
            painter.trace(
                tracer => {
                    tracer.circle(x1, y1, 4);
                    tracer.circle(x2, y2, 4);
                    tracer.line(x1, y1, x2, y2);
                    tracer.arrowHead(x2, y2, 10, angle, Math.PI / 2, 'tip');
                }
            ).thenFill('blue').thenStroke('blue');
        });
}


/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxNode} node
 * @returns {undefined|!Edit}
 */
function maybeExtendToNodeEdit(displayed, node) {
    for (let edge of node.unitEdges()) {
        let edit = maybeExtendAlongEdgeEdit(displayed, edge);
        if (edit !== undefined) {
            return edit;
        }
    }
    return undefined;
}

/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxNode} node
 * @returns {undefined|!Edit}
 */
function maybeRetractNodeEdit(displayed, node) {
    let graph = displayed.graph;
    let edges = graph.activeUnitEdgesOf(node);
    if (edges.length !== 1) {
        return undefined;
    }
    let edge = edges[0];
    let opp = edge.opposite(node);
    let oppDeg = graph.activeUnitEdgesOf(opp).length;
    let kind = graph.nodes.get(node);
    let oppKind = graph.nodes.get(opp);
    let acceptableOverwrites = ['@', 'O'];

    if (oppDeg !== 2) {
        return undefined;
    }

    if (acceptableOverwrites.indexOf(oppKind) === -1) {
        return undefined;
    }

    return new Edit(
        () => `contract ${edge}`,
        graph => {
            graph.edges.delete(edge);
            graph.nodes.delete(node);
            graph.nodes.set(opp, kind);
        },
        (displayed, ctx) => {
            let [x1, y1] = displayed.nodeToXy(node);
            let [x2, y2] = displayed.nodeToXy(opp);
            let dx = x2 - x1;
            let dy = y2 - y1;
            let d = Math.sqrt(dx*dx + dy*dy);
            dx /= d;
            dy /= d;
            let [ex, ey] = [-dy, dx];
            x1 += ex * 10;
            x2 += ex * 10;
            y1 += ey * 10;
            y2 += ey * 10;
            let angle = Math.atan2(dy, dx);
            let painter = new Painter(ctx);
            painter.trace(
                tracer => {
                    tracer.circle(x1, y1, 4);
                    tracer.circle(x2, y2, 4);
                    tracer.line(x1, y1, x2, y2);
                    tracer.arrowHead(x2, y2, 10, angle, Math.PI/2, 'tip');
                }
            ).thenFill('red').thenStroke('red');
        });
}


/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeContractEdgeEdit(displayed, edge) {
    for (let node of edge.nodes()) {
        let edit = maybeRetractNodeEdit(displayed, node);
        if (edit !== undefined) {
            return edit;
        }
    }
    return undefined;
}


/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxNode|!ZxEdge} element
 * @returns {undefined|!Edit}
 */
function maybeDeleteElementEdit(displayed, element) {
    let graph = displayed.graph;
    if (!graph.has(element)) {
        return undefined;
    }

    if (element instanceof ZxNode) {
        return (maybeRemoveConnectingPathEdit(graph, element) ||
            maybeContractNodeEdit(graph, element) ||
            maybeRetractNodeEdit(displayed, element) ||
            removeNodeEdit(element));
    } else if (element instanceof ZxEdge) {
        return (maybeRemoveEdgeModifier(graph, element) ||
            maybeRemoveConnectingPathEdit(graph, element) ||
            maybeContractEdgeEdit(displayed, element) ||
            removeEdgeEdit(element));
    }
}


/**
 * @param {!ZxEdge} edge
 * @returns {!Edit}
 */
function changeEdgeKindEdit(edge) {
    return new Edit(
        () => `cycle ${edge}`,
        graph => {
            let cycle = ['-', 'h', 'x', 'z', 'f', 's', 'w', 'a'];
            let kind = graph.edges.get(edge);
            let i = cycle.indexOf(kind);
            i++;
            i %= cycle.length;
            graph.edges.set(edge, cycle[i]);
        },
        (displayed, ctx) => {
            let [x, y] = displayed.graphElementToCenterXy(edge);
            x += edge.n1.x !== edge.n2.x ? 0 : 15;
            y += edge.n1.x !== edge.n2.x ? 15 : 0;
            ctx.beginPath();
            ctx.arc(x, y, 8, Math.PI/2, 0);
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 3;
            ctx.stroke();
            new Painter(ctx).trace(tracer => {
                tracer.arrowHead(x + 8, y, 4, Math.PI/2, Math.PI/2, 'stem');
            }).thenStroke('blue').thenFill('blue');
        });
}


/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeIntroduceEdgeEdit(displayed, edge) {
    // Check for blocking neighbor.
    let blockKinds = ['in', 'out'];
    for (let node of edge.nodes()) {
        let kind = displayed.graph.nodes.get(node);
        if (blockKinds.indexOf(kind) !== -1) {
            return undefined;
        }
    }

    return new Edit(
        () => `introduce ${edge}`,
        graph => {
            graph.edges.set(edge, '-');
            for (let node of edge.nodes()) {
                if (!graph.nodes.has(node)) {
                    graph.nodes.set(node, 'O');
                }
            }
        },
        (displayed, ctx) => {});
}


/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!boolean} wantDelete
 * @param {!number|undefined} x
 * @param {!number|undefined} y
 * @returns {undefined|!Edit}
 */
function pickEdit(displayed, wantDelete, x, y) {
    if (menuNode !== undefined) {
        let [cx, cy] = nodeToMenuXy(displayed, menuNode);
        let selection = makeNodeRingMenu().entryAt(cx, cy, x, y);
        if (selection !== undefined) {
            if (selection.id === 'del') {
                return maybeDeleteElementEdit(displayed, menuNode);
            }
            return setElementKindEdit(menuNode, selection.id);
        }
        return undefined;
    }

    let oldElement = displayed.xyToGraphElement(mouseDownX, mouseDownY);
    let element = displayed.xyToGraphElement(x, y);
    let nearestNode = displayed.xyToNode(x, y);

    if (element === undefined) {
        return undefined;
    }
    if (!wantDelete &&
            curMouseButton === 1 &&
            oldElement instanceof ZxNode &&
            nearestNode instanceof ZxNode &&
            displayed.graph.has(oldElement)) {
        let result = maybeDragNodeEdit(displayed.graph, oldElement, nearestNode);
        if (result !== undefined) {
            return result;
        }
    }

    if (curMouseButton !== 0 && curMouseButton !== undefined && !element.isEqualTo(oldElement)) {
        return undefined;
    }

    if (wantDelete) {
        return maybeDeleteElementEdit(displayed, element);
    }

    if (element instanceof ZxNode) {
        return maybeExtendToNodeEdit(displayed, element);
    }

    if (element instanceof ZxEdge) {
        if (displayed.graph.has(element)) {
            return changeEdgeKindEdit(element);
        }

        return maybeExtendAlongEdgeEdit(displayed, element) || maybeIntroduceEdgeEdit(displayed, element);
    }
}

/**
 * @returns {undefined|!boolean}
 */
function curWantDeleteEdit() {
    if (curMouseButton === undefined || curMouseButton === 0) {
        return undefined;
    }
    return curMouseButton === 2 || curCtrlKey;
}
canvasDiv.addEventListener('mousedown', ev => {
    if (ev.which !== 1 && ev.which !== 2) {
        return;
    }
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    curMouseButton = ev.which;
    ev.preventDefault();
    [mouseDownX, mouseDownY] = eventPosRelativeTo(ev, canvasDiv);
    draw();
});

// canvasDiv.addEventListener('mouseup', ev => {
//     let displayed = currentlyDisplayedZxGraph;
//     if (ev.which !== 1 && ev.which !== 2) {
//         return;
//     }
//     ev.preventDefault();
//     let [x, y] = eventPosRelativeTo(ev, canvasDiv);
//     curCtrlKey = ev.ctrlKey;
//     curAltKey = ev.altKey;
//     curShiftKey = ev.shiftKey;
//
//     if (menuNode === undefined) {
//         let startNode = displayed.xyToGraphElement(mouseDownX, mouseDownY);
//         let endNode = displayed.xyToGraphElement(x, y);
//         if (startNode instanceof ZxNode && startNode.isEqualTo(endNode) && ev.which === 1) {
//             //noinspection JSUnusedAssignment
//             menuNode = startNode;
//             draw();
//             return;
//         }
//     }
//
//     let edit = pickEdit(displayed, curWantDeleteEdit(), x, y);
//     if (edit !== undefined) {
//         let g = displayed.graph.copy();
//         edit.action(g);
//         cleanAndCommitNewGraph(g);
//     }
//     menuNode = undefined;
//     curMouseButton = undefined;
//     mouseDownX = undefined;
//     mouseDownY = undefined;
//     draw();
// });

// /**
//  * @param {!ZxGraph} g
//  * @param {!boolean} compress
//  */
// function cleanAndCommitNewGraph(g, compress=false) {
//     if (compress) {
//         let {graph, xMap, yMap} = g.autoCompressed();
//         let xTicks = Seq.repeat(0, xMap.size).toArray();
//         let yTicks = Seq.repeat(0, yMap.size).toArray();
//         for (let [oldVal, newVal] of xMap.entries()) {
//             xTicks[newVal] = currentlyDisplayedZxGraph.metricX.coord(oldVal);
//         }
//         for (let [oldVal, newVal] of yMap.entries()) {
//             yTicks[newVal] = currentlyDisplayedZxGraph.metricY.coord(oldVal);
//         }
//         revision.commit(graph.serialize());
//         currentlyDisplayedZxGraph.interpolateFrom(
//             new Metric(xTicks, 50),
//             new Metric(yTicks, 50),
//             0.25)
//     } else {
//         revision.commit(g.serialize());
//     }
// }
//
// canvasDiv.addEventListener('mousemove', ev => {
//     [mouseX, mouseY] = eventPosRelativeTo(ev, canvasDiv);
//     curCtrlKey = ev.ctrlKey;
//     curAltKey = ev.altKey;
//     curShiftKey = ev.shiftKey;
//     curMouseButton = ev.which;
//     draw();
// });
//
// canvasDiv.addEventListener('mouseleave', ev => {
//     curCtrlKey = ev.ctrlKey;
//     curAltKey = ev.altKey;
//     curShiftKey = ev.shiftKey;
//     mouseX = undefined;
//     mouseY = undefined;
//     draw();
// });
//
// /**
//  * @param {!string|!int} keyOrCode
//  * @param {!function(!KeyboardEvent)} func
//  */
// function addKeyListener(keyOrCode, func) {
//     if (!Number.isInteger(keyOrCode)) {
//         keyOrCode = keyOrCode.charCodeAt(0);
//     }
//
//     if (!keyListeners.has(keyOrCode)) {
//         keyListeners.set(keyOrCode, []);
//     }
//     keyListeners.get(keyOrCode).push(func);
// }
//
// addKeyListener(27, () => {
//     menuNode = undefined;
// });

// document.addEventListener('keydown', ev => {
//     let displayed = currentlyDisplayedZxGraph;
//     curCtrlKey = ev.ctrlKey;
//     curAltKey = ev.altKey;
//     curShiftKey = ev.shiftKey;
//
//     if (!curAltKey && !curCtrlKey) {
//         let entry = makeNodeRingMenu().entryForKey(ev.keyCode, curShiftKey);
//         let targetNode = menuNode || displayed.xyToGraphElement(mouseX, mouseY);
//         if (entry !== undefined && targetNode instanceof ZxNode) {
//             let copy = displayed.graph.copy();
//             copy.nodes.set(targetNode, entry.id);
//             cleanAndCommitNewGraph(copy);
//             menuNode = undefined;
//             draw();
//         }
//     }
//
//     let handlers = keyListeners.get(ev.keyCode);
//     if (handlers !== undefined) {
//         ev.preventDefault();
//         for (let handler of handlers) {
//             handler(ev);
//         }
//     }
//     draw();
// });
//
// canvas.addEventListener('keydown', ev => {
//     ev.preventDefault();
// });
//
// canvas.addEventListener('keyup', ev => {
//     ev.preventDefault();
// });
//
// document.addEventListener('keyup', ev => {
//     curCtrlKey = ev.ctrlKey;
//     curAltKey = ev.altKey;
//     curShiftKey = ev.shiftKey;
//     draw();
// });

revision.latestActiveCommit().subscribe(_ => {
    try {
        draw();
    } catch {
        // Ensure subscription starts. Will be rethrown on next draw anyways.
    }
});

canvasDiv.addEventListener('wheel', ev => {
    let x = ev.clientX - canvasDiv.offsetLeft;
    let y = ev.clientY - canvasDiv.offsetTop;
    let f = Math.pow(1.001, -ev.deltaY);
    view.left += x / view.zoom;
    view.top += y / view.zoom;
    view.zoom *= f;
    view.left -= x / view.zoom;
    view.top -= y / view.zoom;
    draw();
});

let prevMouse = /** @type {undefined|!{x: !number, y: !number}} */ undefined;
let selectionStart = /** @type {undefined|!{x: !number, y: !number}} */ undefined;
let selectionEnd = /** @type {undefined|!{x: !number, y: !number}} */ undefined;

/**
 * @param {!number} screen_x
 * @param {!number} screen_y
 * @returns {!{x: !number, y: !number}}
 */
function screen_to_graph_pos(screen_x, screen_y) {
    let x = screen_x;
    let y = screen_y;
    x /= view.zoom;
    y /= view.zoom;
    x += view.left;
    y += view.top;
    return {x, y};
}

/**
 * @param {!number} graph_x
 * @param {!number} graph_y
 * @returns {!{x: !number, y: !number}}
 */
function graph_to_screen_pos(graph_x, graph_y) {
    let x = graph_x;
    let y = graph_y;
    x -= view.left;
    y -= view.top;
    x *= view.zoom;
    y *= view.zoom;
    return {x, y};
}

canvasDiv.addEventListener('mousedown', ev => {
    let x = ev.clientX - canvasDiv.offsetLeft;
    let y = ev.clientY - canvasDiv.offsetTop;
    prevMouse = {x, y};
    if (ev.button === 1) {
        ev.preventDefault();
    }
    if (ev.button === 0) {
        selectionStart = screen_to_graph_pos(x, y);
        selectionEnd = undefined;
        ev.preventDefault();
    }
    draw();
});

canvasDiv.addEventListener('mouseup', ev => {
    let x = ev.clientX - canvasDiv.offsetLeft;
    let y = ev.clientY - canvasDiv.offsetTop;
    if (ev.button === 0) {
        selection.content.clear();
        let state = RasterGraph.fromString(revision.peekActiveCommit());
        for (let [gx, gy, v] of state.entries()) {
            let b = isSelectionRectHighlightingGraphLocation(gx, gy);
            if (b) {
                selection.set(gx, gy, v);
            }
        }
        selectionStart = undefined;
        selectionEnd = undefined;
        ev.preventDefault();
    }
    draw();
});

canvasDiv.addEventListener('mousemove', ev => {
    let x = ev.clientX - canvasDiv.offsetLeft;
    let y = ev.clientY - canvasDiv.offsetTop;
    if (prevMouse !== undefined && (ev.buttons & 4) !== 0) {
        view.left -= (x - prevMouse.x) / view.zoom;
        view.top -= (y - prevMouse.y) / view.zoom;
    }
    if (selectionStart !== undefined && ev.buttons === 1) {
        selectionEnd = screen_to_graph_pos(x, y);
    }
    prevMouse = {x, y};
    ev.preventDefault();
    draw();
});

document.addEventListener("keydown", e => {
    // Don't capture keystrokes while menus are showing.
    if (obsIsAnyOverlayShowing.get()) {
        return;
    }

    let isCopy = e.key === 'c' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
    let isCut = e.key === 'x' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
    if (isCopy || isCut) {
        emulatedClipboardContents = "zigxag::" + selection.toString();
        navigator.clipboard.writeText(emulatedClipboardContents).then(() => {
            emulatedClipboardContents = undefined;
        }).catch(err => {
            console.error('Clipboard permission blocked. Copied content can only be pasted in this tab.', err);
        });
        if (isCut) {
            let state = RasterGraph.fromString(revision.peekActiveCommit());
            for (let [x, y] of selection.keys()) {
                state.delete(x, y);
            }
            revision.commit(state.toString(false));
        }
        e.preventDefault();
    }
});

document.addEventListener('paste', ev => {
    let pasteData;
    if (emulatedClipboardContents !== undefined) {
        pasteData = emulatedClipboardContents;
    } else {
        pasteData = (ev.clipboardData || window.clipboardData).getData('text');
    }
    if (pasteData !== undefined && pasteData.startsWith("zigxag::")) {
        console.log(pasteData);
        ev.preventDefault();
    }
});

setTimeout(draw, 0);
