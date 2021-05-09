/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
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
import {ZxGraph, ZxEdge, ZxNode, optimizeConvertedAdjGraph} from "src/sim/ZxGraph.js";
import {evalZxGraph_ep} from "src/sim/ZxGraphEval_EprEdge_ParityNode.js";
import {evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js";
import {MathPainter} from "src/MathPainter.js";
import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
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
import {NODES} from "src/nodes/All.js";
import {makeNodeRingMenu} from "src/ui/RingMenu.js"
import {ZxNodeDrawArgs} from "src/nodes/ZxNodeKind.js";
import {Point} from "src/base/Point.js";
import {floodFillNodeAndUnitEdgeSpace, DisplayedZxGraph, Metric} from "src/ui/DisplayedZxGraph.js";
import {ObservableValue} from "src/base/Obs.js";
import {initUndoRedo} from "src/ui/UndoRedo.js";
import {initUrlSync} from "src/ui/Url.js";
import {initClear} from "src/ui/Clear.js";
import {initExports, obsExportsIsShowing} from "src/ui/Export.js";

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
const canvasDiv = /** @type {!HTMLDivElement} */ document.getElementById('main-canvas-div');
const stabilizersDiv = /** @type {!HTMLDivElement} */ document.getElementById('stabilizers-div');

let mouseX = undefined;
let mouseY = undefined;
let curCtrlKey = false;
let curAltKey = false;
let curShiftKey = false;
let curMouseButton = undefined;
let mouseDownX = undefined;
let mouseDownY = undefined;
let menuNode = undefined;
let currentlyDisplayedZxGraph = new DisplayedZxGraph();

let revision = new Revision([new ZxGraph().serialize()], 0, false);
let obsCurrentEval = new ObservableValue(graph => evalZxGraph_ep(optimizeConvertedAdjGraph(graph.toAdjGraph())));

let obsIsAnyOverlayShowing = new ObservableValue(false);
initUrlSync(revision);
initExports(revision, obsCurrentEval, obsIsAnyOverlayShowing.observable());
initUndoRedo(revision, obsIsAnyOverlayShowing);
initClear(revision, obsIsAnyOverlayShowing.observable());
obsExportsIsShowing.
    whenDifferent().
    subscribe(e => {
        obsIsAnyOverlayShowing.set(e);
        canvasDiv.tabIndex = e ? -1 : 0;
    });

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxNode} node
 * @param {!number=} radius
 * @param {!string=} fill
 * @param {!string=} stroke
 */
function drawNode(ctx, displayed, node, radius=8, fill=undefined, stroke=undefined) {
    let kind = displayed.graph.nodes.get(node);
    let nodeKind = NODES.map.get(kind);
    if (nodeKind !== undefined) {
        ctx.save();
        ctx.translate(...displayed.nodeToXy(node));
        nodeKind.contentDrawer(ctx, new ZxNodeDrawArgs(displayed.graph, node));
        ctx.restore();
        return;
    }

    if (stroke !== undefined) {
        ctx.strokeStyle = stroke;
    }
    if (fill !== undefined) {
        ctx.fillStyle = fill;
    } else {
        ctx.fillStyle = 'red';
    }
    ctx.beginPath();
    ctx.arc(...displayed.nodeToXy(node), radius, 0, 2*Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxEdge} edge
 * @param {!number=} thickness
 * @param {!string=} color
 * @param {!boolean} showKind
 */
function drawEdge(ctx, displayed, edge, thickness=1, color='black', showKind=true) {
    let kind = displayed.graph.edges.get(edge);
    let [n1, n2] = edge.nodes();
    ctx.beginPath();
    let [x1, y1] = displayed.nodeToXy(n1);
    let [x2, y2] = displayed.nodeToXy(n2);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();

    if (showKind) {
        let nodeKind = NODES.map.get(kind);
        let [cx, cy] = displayed.graphElementToCenterXy(edge);
        if (nodeKind !== undefined) {
            ctx.save();
            ctx.translate(...displayed.graphElementToCenterXy(edge));
            let fakeGraph = new ZxGraph();
            let fakeNode = new ZxNode(cx*2, cy*2);
            fakeGraph.nodes.set(new ZxNode(x1*2, y1*2), displayed.graph.kind(n1));
            fakeGraph.nodes.set(fakeNode, kind);
            fakeGraph.nodes.set(new ZxNode(x2*2, y2*2), displayed.graph.kind(n2));
            nodeKind.contentDrawer(ctx, new ZxNodeDrawArgs(fakeGraph, fakeNode));
            ctx.restore();
            return;
        }

        let r = [cx - 4, cy - 4, 8, 8];
        if (kind !== '-') {
            ctx.fillStyle = 'red';
            ctx.strokeStyle = 'black';
            ctx.fillRect(...r);
            ctx.strokeRect(...r)
        }
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 */
function drawFadedNearbyRegion(ctx, displayed) {
    let element = displayed.xyToGraphElement(mouseX, mouseY);
    if (element === undefined) {
        return;
    }

    ctx.globalAlpha *= 0.25;
    let nearby = seq(floodFillNodeAndUnitEdgeSpace(element)).take(150);
    let [cx, cy] = displayed.graphElementToCenterXy(element);
    for (let e of nearby) {
        if (displayed.graph.has(e) || !(e instanceof ZxEdge)) {
            continue;
        }

        let [ex, ey] = displayed.graphElementToCenterXy(e);
        if (Math.abs(ex - cx) >= 100 || Math.abs(ey - cy) >= 100) {
            continue;
        }

        drawEdge(ctx, displayed, e, undefined, 'gray', false);
    }
    ctx.globalAlpha *= 4;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 */
function drawFocus(ctx, displayed) {
    ctx.globalAlpha *= 0.5;
    let element = displayed.xyToGraphElement(mouseX, mouseY);
    if (element !== undefined) {
        // Draw connecting path.
        let drewPath = false;
        if (displayed.graph.has(element)) {
            let path = displayed.graph.extendedUnblockedPath(element, false);
            for (let e of path) {
                drewPath = true;
                drawEdge(ctx, displayed, e, 7, 'gray', false);
            }
        }

        if (element instanceof ZxNode) {
            drawNode(ctx, displayed, element, displayed.graph.has(element) ? 12 : 7, 'gray', '#00000000');
        } else if (element instanceof ZxEdge) {
            if (!drewPath) {
                drawEdge(ctx, displayed, element, 7, 'gray', false);
            }
        }
    }
    ctx.globalAlpha *= 2;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param{!DisplayedZxGraph} displayed
 */
function drawPossibleEdit(ctx, displayed) {
    let deletePref = curWantDeleteEdit();
    let choices = deletePref === undefined ? [false, true] : [deletePref];

    if (deletePref === undefined) {
        ctx.globalAlpha *= 0.25;
    }

    let drewEdit = false;
    for (let choice of choices) {
        let edit = pickEdit(displayed, choice, mouseX, mouseY);
        if (edit !== undefined) {
            edit.drawPreview(displayed, ctx);
            drewEdit = true;
        }
    }

    if (deletePref === undefined) {
        ctx.globalAlpha *= 4;
    }
}

/**
 * @param {*} object
 * @param {!string} key
 * @param {*} value
 */
function setIfDiffers(object, key, value) {
    if (object[key] !== value) {
        object[key] = value;
    }
}

let prevGraph = undefined;
let prevResults = undefined;

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 * @param {!boolean=} checkGroundTruth
 */
function drawResults(ctx, displayed, checkGroundTruth=false) {
    let graph = displayed.graph;
    if (!graph.isEqualTo(prevGraph)) {
        prevResults = obsCurrentEval.get()(graph);
        prevGraph = graph;
    }
    let results = prevResults;
    let numIn = graph.inputNodes().length;
    function descStabilizer(s) {
        let r = s.toString();
        return `${r.slice(0, 1)}${r.slice(1, numIn+1)}→${r.slice(numIn+1)}`;
    }

    setIfDiffers(
        stabilizersDiv,
        'innerText',
        results.stabilizers.map(descStabilizer).join('\n'));

    let waveRect = new Rect(canvas.clientWidth - 300, 0, 300, 300);
    let painter = new Painter(ctx);

    if (results.successProbability !== 1) {
        let loss = Math.log2(results.successProbability);
        painter.printParagraph(
            [
                `Chance of success: ${Math.round(results.successProbability*100)}%`,
                `(${Math.round(-loss)} coin flips)`
            ].join('\n'),
            waveRect.takeBottom(50).proportionalShiftedBy(0, 1),
            new Point(0.5, 0.5),
            'black',
            20);
    }
    if (!results.satisfiable) {
        painter.printParagraph(
            `Graph is not satisfiable. (Output may be path dependent.)`,
            waveRect.takeBottom(50).proportionalShiftedBy(0, 2),
            new Point(0.5, 0.5),
            'red',
            20);
    }
}

/**
 * @param {!DisplayedZxGraph} displayed
 * @param {!ZxNode} node
 * @returns {![!number, !number]}
 */
function nodeToMenuXy(displayed, node) {
    let [x, y] = displayed.nodeToXy(node);
    x = Math.max(x, 170);
    y = Math.max(y, 140);
    return [x, y];
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!DisplayedZxGraph} displayed
 */
function drawGraph(ctx, displayed) {
    let graph = displayed.graph;
    for (let edge of graph.edges.keys()) {
        drawEdge(ctx, displayed, edge);
    }
    for (let node of graph.nodes.keys()) {
        if (graph.kind(node) !== '+') {
            drawNode(ctx, displayed, node);
        }
    }
}

let _drawRequested = false;
function draw() {
    let displayed = currentlyDisplayedZxGraph;

    //noinspection JSUnresolvedVariable
    let t = performance.now();
    if (!_drawRequested && t < displayed.interpolateEndTime) {
        _drawRequested = true;
        requestAnimationFrame(() => {
            _drawRequested = false;
            draw();
        });

    }
    displayed.interpolateTick(t);

    let drawBox = displayed.boundingDrawBox(true);
    canvas.width = Math.max(canvasDiv.clientWidth, drawBox.x + drawBox.w);
    canvas.height = Math.max(400, drawBox.y + drawBox.h);

    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.clearRect(0, 0, 100000, 100000);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 10000, 10000);

    ctx.save();
    try {
        if (menuNode === undefined) {
            drawFocus(ctx, displayed);
        }
        try {
            drawResults(ctx, displayed);
            drawFadedNearbyRegion(ctx, displayed);
        } finally {
            drawGraph(ctx, displayed);
            if (menuNode === undefined) {
                drawPossibleEdit(ctx, displayed);
            }
        }

        if (menuNode !== undefined) {
            ctx.save();
            ctx.globalAlpha *= 0.85;
            ctx.beginPath();
            let [nx, ny] = displayed.nodeToXy(menuNode);
            ctx.arc(nx, ny, 1000, 0, 2*Math.PI);
            ctx.lineWidth = 1950;
            ctx.strokeStyle = 'white';
            ctx.stroke();
            ctx.restore();

            let [x, y] = nodeToMenuXy(displayed, menuNode);
            makeNodeRingMenu().draw(ctx, x, y, curShiftKey, mouseX, mouseY);
        }
    } finally {
        ctx.restore();
    }
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

canvasDiv.addEventListener('mouseup', ev => {
    let displayed = currentlyDisplayedZxGraph;
    if (ev.which !== 1 && ev.which !== 2) {
        return;
    }
    ev.preventDefault();
    let [x, y] = eventPosRelativeTo(ev, canvasDiv);
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;

    if (menuNode === undefined) {
        let startNode = displayed.xyToGraphElement(mouseDownX, mouseDownY);
        let endNode = displayed.xyToGraphElement(x, y);
        if (startNode instanceof ZxNode && startNode.isEqualTo(endNode) && ev.which === 1) {
            //noinspection JSUnusedAssignment
            menuNode = startNode;
            draw();
            return;
        }
    }

    let edit = pickEdit(displayed, curWantDeleteEdit(), x, y);
    if (edit !== undefined) {
        let g = displayed.graph.copy();
        edit.action(g);
        cleanAndCommitNewGraph(g);
    }
    menuNode = undefined;
    curMouseButton = undefined;
    mouseDownX = undefined;
    mouseDownY = undefined;
    draw();
});

/**
 * @param {!ZxGraph} g
 * @param {!boolean} compress
 */
function cleanAndCommitNewGraph(g, compress=false) {
    if (compress) {
        let {graph, xMap, yMap} = g.autoCompressed();
        let xTicks = Seq.repeat(0, xMap.size).toArray();
        let yTicks = Seq.repeat(0, yMap.size).toArray();
        for (let [oldVal, newVal] of xMap.entries()) {
            xTicks[newVal] = currentlyDisplayedZxGraph.metricX.coord(oldVal);
        }
        for (let [oldVal, newVal] of yMap.entries()) {
            yTicks[newVal] = currentlyDisplayedZxGraph.metricY.coord(oldVal);
        }
        revision.commit(graph.serialize());
        currentlyDisplayedZxGraph.interpolateFrom(
            new Metric(xTicks, 50),
            new Metric(yTicks, 50),
            0.25)
    } else {
        revision.commit(g.serialize());
    }
}

canvasDiv.addEventListener('mousemove', ev => {
    [mouseX, mouseY] = eventPosRelativeTo(ev, canvasDiv);
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    curMouseButton = ev.which;
    draw();
});

canvasDiv.addEventListener('mouseleave', ev => {
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    mouseX = undefined;
    mouseY = undefined;
    draw();
});

/**
 * @param {!string|!int} keyOrCode
 * @param {!function(!KeyboardEvent)} func
 */
function addKeyListener(keyOrCode, func) {
    if (!Number.isInteger(keyOrCode)) {
        keyOrCode = keyOrCode.charCodeAt(0);
    }

    if (!keyListeners.has(keyOrCode)) {
        keyListeners.set(keyOrCode, []);
    }
    keyListeners.get(keyOrCode).push(func);
}

addKeyListener(27, () => {
    menuNode = undefined;
});

document.addEventListener('keydown', ev => {
    let displayed = currentlyDisplayedZxGraph;
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;

    if (!curAltKey && !curCtrlKey) {
        let entry = makeNodeRingMenu().entryForKey(ev.keyCode, curShiftKey);
        let targetNode = menuNode || displayed.xyToGraphElement(mouseX, mouseY);
        if (entry !== undefined && targetNode instanceof ZxNode) {
            let copy = displayed.graph.copy();
            copy.nodes.set(targetNode, entry.id);
            cleanAndCommitNewGraph(copy);
            menuNode = undefined;
            draw();
        }
    }

    let handlers = keyListeners.get(ev.keyCode);
    if (handlers !== undefined) {
        ev.preventDefault();
        for (let handler of handlers) {
            handler(ev);
        }
    }
    draw();
});

canvas.addEventListener('keydown', ev => {
    ev.preventDefault();
});

canvas.addEventListener('keyup', ev => {
    ev.preventDefault();
});

document.addEventListener('keyup', ev => {
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    draw();
});

revision.latestActiveCommit().subscribe(text => {
    let graph = ZxGraph.deserialize(text);
    currentlyDisplayedZxGraph.graph = graph;
    currentlyDisplayedZxGraph.resetMetric();

    //noinspection EmptyCatchBlockJS,UnusedCatchParameterJS
    try {
        draw();
    } catch (_) {
        // Ensure subscription starts. Will be rethrown on next draw anyways.
    }
});
