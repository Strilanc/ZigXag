/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
window.onerror = function(msg, url, line, col, error) {
    document.getElementById('err_msg').innerText = `${describe(msg)}\n${error.stack}`;
    document.getElementById('err_line').innerText = describe(line);
    document.getElementById('err_time').innerText = '' + new Date().getMilliseconds();
    if (error instanceof DetailedError) {
        document.getElementById('err_gen').innerText = describe(error.details);
    }
};

import {Revision} from "src/base/Revision.js";
import {Reader, Writer} from "src/base/Serialize.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {equate} from "src/base/Equate.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js";
import {evalZxGraph} from "src/sim/ZxGraphEval.js";
import {evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js";
import {Util} from "src/base/Util.js";
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
} from "src/edit.js";
import {NODES} from "src/sim/ZxNodeKind.js";
import {makeNodeRingMenu} from "src/ui/RingMenu.js"

/**
 * @returns {!string}
 */
function initialCommit() {
    if (document.location.hash.length > 1) {
        return document.location.hash.substr(1);
    }

    let g = new ZxGraph();
    let x = 4;
    let y = 4;
    g.add_line(new ZxNode(x, y), new ZxNode(x+2, y), ['in', '@', 'out']);
    g.add_line(new ZxNode(x, y+1), new ZxNode(x+2, y+1), ['in', 'O', 'out']);
    g.add_line(new ZxNode(x+1, y), new ZxNode(x+1, y+1));
    return g.serialize();
}

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
const canvasDiv = /** @type {!HTMLDivElement} */ document.getElementById('main-canvas-div');
const stabilizersDiv = /** @type {!HTMLDivElement} */ document.getElementById('stabilizers-div');
const quirkAnchor = /** @type {!HTMLDivElement} */ document.getElementById('quirk-link-anchor');
const qasmPre = /** @type {!HTMLPreElement} */ document.getElementById('qasm-pre');
const satisfiablePre = /** @type {!HTMLPreElement} */ document.getElementById('satisfiable-pre');
const textDiagramPre = /** @type {!HTMLPreElement} */ document.getElementById('text-diagram-pre');
let mouseX = undefined;
let mouseY = undefined;
let curCtrlKey = false;
let curAltKey = false;
let curShiftKey = false;
let curMouseButton = undefined;
let mouseDownX = undefined;
let mouseDownY = undefined;
let menuNode = undefined;


let curGraph = /** @type {undefined|!ZxGraph} */ undefined;
let revision = new Revision([initialCommit()], 0, false);


/**
 * @param {!ZxNode} n
 * @returns {![!number, !number]}
 */
function nodeToXy(n) {
    return [-100 + n.x * 50, -100 + n.y * 50];
}

/**
 * @param {!ZxNode|!ZxEdge} element
 * @yields {!ZxNodePos|!ZxEdgePos}
 */
function* floodFillNodeAndUnitEdgeSpace(element) {
    let queue = [element];
    let seen = new GeneralSet();
    while (queue.length >= 0) {
        let next = queue.shift();
        if (seen.has(next)) {
            continue;
        }
        seen.add(next);
        yield next;
        if (next instanceof ZxNode) {
            queue.push(...next.unitEdges())
        } else {
            queue.push(...next.nodes())
        }
    }
}

/**
 * @param {!ZxNode|!ZxEdge} element
 * @returns {![!number, !number]}
 */
function graphElementToCenterXy(element) {
    if (element instanceof ZxNode) {
        return nodeToXy(element);
    } else {
        let [n1, n2] = element.nodes();
        let [x1, y1] = nodeToXy(n1);
        let [x2, y2] = nodeToXy(n2);
        return [(x1 + x2) / 2, (y1 + y2) / 2];
    }
}

/**
 * @param {!number} x
 * @param {!number} y
 * @param {!ZxNode|!ZxEdge} element
 */
function xyDistanceToGraphElement(x, y, element) {
    let [cx, cy] = graphElementToCenterXy(element);
    let dx = x - cx;
    let dy = y - cy;
    return Math.sqrt(dx*dx + dy*dy);
}

/**
 * @param {!number|undefined} x
 * @param {!number|undefined} y
 * @returns {undefined|!ZxNode|!ZxEdge}
 */
function xyToNode(x, y) {
    if (x === undefined || y === undefined) {
        return undefined;
    }
    let nx = Math.floor((x + 100) / 50 + 0.5);
    let ny = Math.floor((y + 100) / 50 + 0.5);
    return new ZxNode(nx, ny);
}

/**
 * @param {!number|undefined} x
 * @param {!number|undefined} y
 * @returns {undefined|!ZxNode|!ZxEdge}
 */
function xyToGraphElement(x, y) {
    if (x === undefined || y === undefined) {
        return undefined;
    }
    let nx = Math.floor((x + 100) / 50 + 0.25);
    let ny = Math.floor((y + 100) / 50 + 0.25);
    let region = seq(floodFillNodeAndUnitEdgeSpace(new ZxNode(nx, ny))).take(20);
    region = region.filter(e => e instanceof ZxEdge || curGraph.has(e));
    return region.minBy(e => xyDistanceToGraphElement(x, y, e));
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!ZxNode} node
 * @param {!number=} radius
 * @param {!string=} fill
 * @param {!string=} stroke
 */
function drawNode(ctx, node, radius=8, fill=undefined, stroke=undefined) {
    let kind = curGraph.nodes.get(node);
    let nodeKind = NODES.map.get(kind);
    if (nodeKind !== undefined) {
        ctx.save();
        ctx.translate(...nodeToXy(node));
        nodeKind.contentDrawer(ctx);
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
    ctx.arc(...nodeToXy(node), radius, 0, 2*Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!ZxEdge} edge
 * @param {!number=} thickness
 * @param {!string=} color
 * @param {!boolean} showKind
 */
function drawEdge(ctx, edge, thickness=1, color='black', showKind=true) {
    let kind = curGraph.edges.get(edge);
    let [n1, n2] = edge.nodes();
    ctx.beginPath();
    let [x1, y1] = nodeToXy(n1);
    let [x2, y2] = nodeToXy(n2);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();

    if (showKind) {
        let nodeKind = NODES.map.get(kind);
        if (nodeKind !== undefined) {
            ctx.save();
            ctx.translate(...graphElementToCenterXy(edge));
            nodeKind.contentDrawer(ctx);
            ctx.restore();
            return;
        }

        let [cx, cy] = graphElementToCenterXy(edge);
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
 */
function drawFadedNearbyRegion(ctx) {
    let element = xyToGraphElement(mouseX, mouseY);
    if (element === undefined) {
        return;
    }

    ctx.globalAlpha *= 0.25;
    let nearby = seq(floodFillNodeAndUnitEdgeSpace(element)).take(150);
    let [cx, cy] = graphElementToCenterXy(element);
    for (let e of nearby) {
        if (curGraph.has(e) || !(e instanceof ZxEdge)) {
            continue;
        }

        let [ex, ey] = graphElementToCenterXy(e);
        if (Math.abs(ex - cx) >= 100 || Math.abs(ey - cy) >= 100) {
            continue;
        }

        drawEdge(ctx, e, undefined, 'gray', false);
    }
    ctx.globalAlpha *= 4;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 */
function drawFocus(ctx) {
    ctx.globalAlpha *= 0.5;
    let element = xyToGraphElement(mouseX, mouseY);
    if (element !== undefined) {
        // Draw connecting path.
        let drewPath = false;
        if (curGraph.has(element)) {
            let path = curGraph.extendedUnblockedPath(element, false);
            for (let e of path) {
                drewPath = true;
                drawEdge(ctx, e, 7, 'gray', false);
            }
        }

        if (element instanceof ZxNode) {
            drawNode(ctx, element, curGraph.has(element) ? 12 : 7, 'gray', '#00000000');
        } else if (element instanceof ZxEdge) {
            if (!drewPath) {
                drawEdge(ctx, element, 7, 'gray', false);
            }
        }
    }
    ctx.globalAlpha *= 2;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 */
function drawPossibleEdit(ctx) {
    let deletePref = curWantDeleteEdit();
    let choices = deletePref === undefined ? [false, true] : [deletePref];

    if (deletePref === undefined) {
        ctx.globalAlpha *= 0.25;
    }

    let drewEdit = false;
    for (let choice of choices) {
        let edit = pickEdit(choice, mouseX, mouseY);
        if (edit !== undefined) {
            edit.drawPreview(curGraph, ctx);
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
 */
function drawResults(ctx) {
    if (!curGraph.isEqualTo(prevGraph)) {
        prevResults = evalZxGraph(curGraph);
        prevGraph = curGraph;
    }
    let results = prevResults;
    let numIn = curGraph.inputNodes().length;
    function descStabilizer(s) {
        let r = s.toString();
        return `${r.slice(0, 1)}${r.slice(1, numIn+1)}→${r.slice(numIn+1)}`;
    }

    setIfDiffers(
        stabilizersDiv,
        'innerText',
        results.stabilizers.map(descStabilizer).join('\n'));
    setIfDiffers(
        quirkAnchor,
        'href',
        results.quirkUrl);
    setIfDiffers(
        qasmPre,
        'innerText',
        results.qasm);
    setIfDiffers(
        textDiagramPre,
        'innerText',
        curGraph.toString(true));
    setIfDiffers(
        satisfiablePre,
        'innerText',
        [
            results.satisfiable ? 'Graph is satisfiable' : 'GRAPH IS NOT SATISFIABLE',
            `Chance of post-selection succeeding: ${results.successProbability * 100}%`
        ].join('\n'));

    let s = new Rect(canvas.clientWidth - 300, 0, 300, 300);
    let painter = new Painter(ctx);
    MathPainter.paintMatrix(
        painter,
        results.wavefunction,
        s,
        undefined,
        undefined,
        results.satisfiable ? undefined : 'red');
    let groundTruth = evalZxGraphGroundTruth(curGraph);
    groundTruth = groundTruth.phaseMatchedTo(results.wavefunction);
    ctx.globalAlpha *= 0.5;
    MathPainter.paintMatrix(painter, groundTruth, s, 'yellow', 'black', '#00000000', '#00000000');
    ctx.globalAlpha *= 2;
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 */
function drawGraph(ctx) {
    for (let edge of curGraph.edges.keys()) {
        drawEdge(ctx, edge);
    }
    for (let node of curGraph.nodes.keys()) {
        if (curGraph.kind(node) !== '+') {
            drawNode(ctx, node);
        }
    }
}

function draw() {
    canvas.width = canvasDiv.clientWidth;
    canvas.height = 600;

    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.clearRect(0, 0, 10000, 10000);

    ctx.save();
    try {
        if (menuNode === undefined) {
            drawFocus(ctx);
        }
        try {
            drawResults(ctx);
            drawFadedNearbyRegion(ctx);
        } finally {
            drawGraph(ctx);
            if (menuNode === undefined) {
                drawPossibleEdit(ctx);
            }
        }

        if (menuNode !== undefined) {
            ctx.save();
            let [x, y] = nodeToXy(menuNode);
            x = Math.max(x, 125);
            y = Math.max(y, 125);
            ctx.globalAlpha *= 0.85;
            ctx.beginPath();
            ctx.arc(x, y, 1000, 0, 2*Math.PI);
            ctx.lineWidth = 1950;
            ctx.strokeStyle = 'white';
            ctx.stroke();
            ctx.restore();

            makeNodeRingMenu().draw(ctx, x, y, curShiftKey, mouseX, mouseY);
        }
    } finally {
        ctx.restore();
    }
}

let keyListeners = /** @type {!Map.<!int, !Array.<!function(!KeyboardEvent)>>} */ new Map();

/**
 * @param {!MouseEvent|!Touch} ev
 * @param {!HTMLElement} element
 * @returns {![!number, !number]}
 */
function eventPosRelativeTo(ev, element) {
    let b = element.getBoundingClientRect();
    return [ev.clientX - b.left, ev.clientY - b.top];
}


/**
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeExtendAlongEdgeEdit(edge) {
    if (curGraph.edges.has(edge)) {
        return undefined;
    }

    let [n1, n2] = edge.nodes();
    let b1 = curGraph.nodes.has(n1);
    let b2 = curGraph.nodes.has(n2);
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
        (graph, ctx) => {
            let [x1, y1] = nodeToXy(n1);
            let [x2, y2] = nodeToXy(n2);
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
 * @param {!ZxNode} node
 * @returns {undefined|!Edit}
 */
function maybeExtendToNodeEdit(node) {
    for (let edge of node.unitEdges()) {
        let edit = maybeExtendAlongEdgeEdit(edge);
        if (edit !== undefined) {
            return edit;
        }
    }
    return undefined;
}

/**
 * @param {!ZxNode} node
 * @returns {undefined|!Edit}
 */
function maybeRetractNodeEdit(node) {
    let edges = curGraph.activeUnitEdgesOf(node);
    if (edges.length !== 1) {
        return undefined;
    }
    let edge = edges[0];
    let opp = edge.opposite(node);
    let oppDeg = curGraph.activeUnitEdgesOf(opp).length;
    let kind = curGraph.nodes.get(node);
    let oppKind = curGraph.nodes.get(opp);
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
        (graph, ctx) => {
            let [x1, y1] = nodeToXy(node);
            let [x2, y2] = nodeToXy(opp);
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
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeContractEdgeEdit(edge) {
    for (let node of edge.nodes()) {
        let edit = maybeRetractNodeEdit(node);
        if (edit !== undefined) {
            return edit;
        }
    }
    return undefined;
}


/**
 * @param {!ZxNode|!ZxEdge} element
 * @returns {undefined|!Edit}
 */
function maybeDeleteElementEdit(element) {
    if (!curGraph.has(element)) {
        return undefined;
    }

    if (element instanceof ZxNode) {
        return (maybeRemoveConnectingPathEdit(curGraph, element) ||
            maybeContractNodeEdit(curGraph, element) ||
            maybeRetractNodeEdit(element) ||
            removeNodeEdit(element));
    } else if (element instanceof ZxEdge) {
        return (maybeRemoveEdgeModifier(curGraph, element) ||
            maybeRemoveConnectingPathEdit(curGraph, element) ||
            maybeContractEdgeEdit(element) ||
            removeEdgeEdit(element));
    }
}



/**
 * @param {!ZxNode} node
 * @returns {!Edit}
 */
function changeNodeKindEdit(node) {
    return new Edit(
        () => `cycle ${node}`,
        graph => {
            let cycle = ['O', '@', '+', 'in', 'out', 'O!', '@!'];
            let kind = graph.nodes.get(node);
            let i = cycle.indexOf(kind);
            i++;
            i %= cycle.length;
            let degree = graph.activeUnitEdgesOf(node).length;
            if (i === 2 && degree !== 2 && degree !== 4) {
                i++;
            }
            if (i >= 3 && degree !== 1) {
                i = 0;
            }
            graph.nodes.set(node, cycle[i]);
        },
        (graph, ctx) => {
            let [x, y] = nodeToXy(node);
            x += 15;
            y += 15;
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
 * @param {!ZxEdge} edge
 * @returns {!Edit}
 */
function changeEdgeKindEdit(edge) {
    return new Edit(
        () => `cycle ${edge}`,
        graph => {
            let cycle = ['-', 'h', 'x', 'z', 'f', 's', 'w', 'a'];
            let kind = curGraph.edges.get(edge);
            let i = cycle.indexOf(kind);
            i++;
            i %= cycle.length;
            graph.edges.set(edge, cycle[i]);
        },
        (graph, ctx) => {
            let [x, y] = graphElementToCenterXy(edge);
            x += edge.horizontal ? 0 : 15;
            y += edge.horizontal ? 15 : 0;
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
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeIntroduceEdgeEdit(edge) {
    // Check for blocking neighbor.
    let blockKinds = ['in', 'out'];
    for (let node of edge.nodes()) {
        let kind = curGraph.nodes.get(node);
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
        (graph, ctx) => {});
}


/**
 * @param {!boolean} wantDelete
 * @param {!number|undefined} x
 * @param {!number|undefined} y
 * @returns {undefined|!Edit}
 */
function pickEdit(wantDelete, x, y) {
    let oldElement = xyToGraphElement(mouseDownX, mouseDownY);
    let element = xyToGraphElement(x, y);
    let nearestNode = xyToNode(x, y);

    if (element === undefined) {
        return undefined;
    }
    if (!wantDelete &&
            curMouseButton === 1 &&
            oldElement instanceof ZxNode &&
            nearestNode instanceof ZxNode &&
            curGraph.has(oldElement)) {
        let result = maybeDragNodeEdit(curGraph, oldElement, nearestNode);
        if (result !== undefined) {
            return result;
        }
    }

    if (curMouseButton !== 0 && curMouseButton !== undefined && !element.isEqualTo(oldElement)) {
        return undefined;
    }

    if (wantDelete) {
        return maybeDeleteElementEdit(element);
    }

    if (element instanceof ZxNode) {
        if (curGraph.has(element)) {
            return changeNodeKindEdit(element);
        }

        return maybeExtendToNodeEdit(element);
    }

    if (element instanceof ZxEdge) {
        if (curGraph.has(element)) {
            return changeEdgeKindEdit(element);
        }

        return maybeExtendAlongEdgeEdit(element) || maybeIntroduceEdgeEdit(element);
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
    if (ev.which !== 1 && ev.which !== 2) {
        return;
    }
    ev.preventDefault();
    let [x, y] = eventPosRelativeTo(ev, canvasDiv);

    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;

    let startNode = xyToNode(mouseDownX, mouseDownY);
    let endNode = xyToNode(mouseDownX, mouseDownY);
    if (startNode !== undefined && startNode.isEqualTo(endNode) && ev.which === 1 && ev.altKey) {
        menuNode = startNode;
        draw();
        return;
    }

    let edit = pickEdit(curWantDeleteEdit(), x, y);
    if (edit !== undefined) {
        let g = curGraph.copy();
        edit.action(g);
        revision.commit(g.serialize());
    }
    curMouseButton = undefined;
    mouseDownX = undefined;
    mouseDownY = undefined;
    draw();
});

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

addKeyListener('Z', ev => {
    if (ev.ctrlKey && !ev.shiftKey) {
        revision.cancelCommitBeingWorkedOn();
        revision.undo();
    } else if (ev.ctrlKey && ev.shiftKey) {
        revision.redo();
    }
});

addKeyListener('Y', ev => {
    if (ev.ctrlKey && !ev.shiftKey) {
        revision.redo();
    }
});

addKeyListener(27, ev => {
    menuNode = undefined;
});

document.addEventListener('keydown', ev => {
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
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
    console.log("KEYUP");
    curCtrlKey = ev.ctrlKey;
    curAltKey = ev.altKey;
    curShiftKey = ev.shiftKey;
    draw();
});

revision.latestActiveCommit().subscribe(text => {
    curGraph = ZxGraph.deserialize(text);
    document.location.hash = text;
    try {
        draw();
    } catch (ex) {
        // Ensure subscription starts. Will be rethrown on next draw anyways.
    }
});
