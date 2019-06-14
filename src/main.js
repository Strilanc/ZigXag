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
import {GeneralSet} from "src/base/GeneralSet.js";
import {ZxGraph, ZxEdgePos, ZxNodePos} from "src/sim/ZxGraph.js";
import {evalZxGraph} from "src/sim/ZxGraphEval.js";
import {Util} from "src/base/Util.js";
import {MathPainter} from "src/MathPainter.js";
import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {Seq, seq} from "src/base/Seq.js";

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
    g.add_line(new ZxNodePos(x, y), new ZxNodePos(x+2, y), ['in', '@', 'out']);
    g.add_line(new ZxNodePos(x, y+1), new ZxNodePos(x+2, y+1), ['in', 'O', 'out']);
    g.add_line(new ZxNodePos(x+1, y), new ZxNodePos(x+1, y+1));
    return g.serialize();
}

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
const canvasDiv = /** @type {!HTMLDivElement} */ document.getElementById('main-canvas-div');
const stabilizersDiv = /** @type {!HTMLDivElement} */ document.getElementById('stabilizers-div');
const quirkAnchor = /** @type {!HTMLDivElement} */ document.getElementById('quirk-link-anchor');
const qasmDiv = /** @type {!HTMLDivElement} */ document.getElementById('qasm-div');
let mouseX = undefined;
let mouseY = undefined;


let curGraph = undefined;
let revision = new Revision([initialCommit()], 0, false);
revision.latestActiveCommit().subscribe(text => {
    curGraph = ZxGraph.deserialize(text);
    document.location.hash = text;
    draw();
});


/**
 * @param {!ZxNodePos} n
 * @returns {![!number, !number]}
 */
function nodeToXy(n) {
    return [-100 + n.x * 50, -100 + n.y * 50];
}

/**
 * @param {!number} x
 * @param {!number} y
 * @returns {!{element: undefined|!ZxNodePos|!ZxEdgePos, hitRect: undefined|[!number, !number, !number, !number]}}
 */
function xyToGraphElement(x, y) {
    let nx = (x + 100) / 50 + 0.25;
    let ny = (y + 100) / 50 + 0.25;

    let kx = Math.floor(nx);
    let ky = Math.floor(ny);
    let vx = Math.floor(Util.properMod(nx * 2, 2));
    let vy = Math.floor(Util.properMod(ny * 2, 2));
    let hitRect = [-100-25/2+(kx * 2 + vx) * 50/2, -100-25/2+(ky * 2 + vy) * 50/2, 25, 25];
    if (kx < 0 || ky < 0) {
        return {element: undefined, hitRect};
    }
    let node = new ZxNodePos(kx, ky);
    if (vx === 0 && vy === 0) {
        return {element: node, hitRect};
    }
    if (vx === 1 && vy === 0) {
        return {element: node.right_edge_position(), hitRect};
    }
    if (vx === 0 && vy === 1) {
        return {element: node.down_edge_position(), hitRect};
    }
    return {element: undefined, hitRect};
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!ZxNodePos} node
 * @param {!number=} radius
 * @param {!string=} fill
 */
function drawNode(ctx, node, radius=8, fill=undefined) {
    let kind = curGraph.nodes.get(node);
    let text = '';
    if (fill !== undefined) {
        ctx.fillStyle = fill;
    } else if (kind === 'O') {
        ctx.fillStyle = 'white';
    } else if (kind === '@') {
        ctx.fillStyle = 'black';
    } else if (kind === 'in' || kind === 'out') {
        ctx.fillStyle = 'yellow';
        text = kind[0];
    } else {
        ctx.fillStyle = 'red';
    }
    ctx.beginPath();
    ctx.arc(...nodeToXy(node), radius, 0, 2*Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.stroke();

    if (text !== '') {
        let [x, y] = nodeToXy(node);
        ctx.fillStyle = 'black';
        ctx.font = '14px monospace';
        ctx.fillText(text, x-4, y+5);
    }
}

/**
 * @param {!CanvasRenderingContext2D} ctx
 * @param {!ZxEdgePos} edge
 * @param {!number=} thickness
 * @param {!string=} color
 */
function drawEdge(ctx, edge, thickness=1, color='black') {
    let kind = curGraph.edges.get(edge);
    let [n1, n2] = edge.adjacent_node_positions();
    ctx.beginPath();
    let [x1, y1] = nodeToXy(n1);
    let [x2, y2] = nodeToXy(n2);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();

    let r = [(x1+x2)/2-4, (y1+y2)/2-4, 8, 8];
    if (kind === 'h') {
        ctx.fillStyle = 'yellow';
        ctx.strokeStyle = 'black';
        ctx.fillRect(...r);
        ctx.strokeRect(...r)
    } else if (kind !== '-') {
        ctx.fillStyle = 'red';
        ctx.strokeStyle = 'black';
        ctx.fillRect(...r);
        ctx.strokeRect(...r)
    }
}

function draw() {
    canvas.width = canvasDiv.clientWidth;
    canvas.height = 300;

    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.clearRect(0, 0, 10000, 10000);


    if (mouseX !== undefined && mouseY !== undefined) {
        let {element, hitRect} = xyToGraphElement(mouseX, mouseY);
        if (hitRect !== undefined) {
            ctx.fillStyle = '#ddd';
            ctx.fillRect(...hitRect);
        }

        if (element instanceof ZxNodePos) {
            drawNode(ctx, element, 12, 'gray');
        } else if (element instanceof ZxEdgePos) {
            drawEdge(ctx, element, 7, 'gray');
        }
    }

    for (let edge of curGraph.edges.keys()) {
        drawEdge(ctx, edge);
    }
    for (let node of curGraph.nodes.keys()) {
        drawNode(ctx, node);
    }

    let results = evalZxGraph(curGraph);
    let numIn = curGraph.inputNodes().length;
    function descStabilizer(s) {
        let r = s.toString();
        return `${r.slice(0, 1)}${r.slice(1, numIn+1)}→${r.slice(numIn+1)}`;
    }
    stabilizersDiv.innerText = results.stabilizers.map(descStabilizer).join('\n');
    quirkAnchor.href = results.quirk_url;
    qasmDiv.innerText = results.qasm;
    let s = new Rect(600, 0, 300, 300);
    MathPainter.paintMatrix(new Painter(canvas), results.wavefunction, s);
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
 * @param {!ZxEdgePos} edge
 * @returns {undefined|!function(): !ZxGraph}
 */
function extender(edge) {
    if (curGraph.edges.has(edge)) {
        return undefined;
    }
    let [n1, n2] = edge.adjacent_node_positions();
    let b1 = curGraph.nodes.has(n1);
    let b2 = curGraph.nodes.has(n2);
    if (b1 === b2) {
        return undefined;
    }
    if (b2) {
        [n1, n2] = [n2, n1];
    }
    let kind = curGraph.nodes.get(n1);

    return g => {
        if (kind === 'in' || kind === 'out') {
            g.nodes.set(n1, 'O');
        }
        g.nodes.set(n2, kind);
        g.edges.set(edge, '-');
    };
}


/**
 * @param {!ZxNodePos} node
 * @returns {undefined|!function(!ZxGraph)}
 */
function contracter(node) {
    let edges = curGraph.edges_of(node);
    if (edges.length !== 1) {
        return undefined;
    }
    let edge = edges[0];
    let opp = edge.opposite(node);
    let oppDeg = curGraph.edges_of(opp).length;
    let kind = curGraph.nodes.get(node);
    let oppKind = curGraph.nodes.get(opp);

    if (oppDeg === 1) {
        return g => {
            g.edges.delete(edge);
            g.nodes.delete(node);
            g.nodes.delete(opp);
        }
    }

    if (oppDeg === 2) {
        return g => {
            g.edges.delete(edge);
            g.nodes.delete(node);
            g.nodes.set(opp, kind);
        }
    }

    if (oppDeg >= 3 && (oppKind === kind)) {
        return g => {
            g.edges.delete(edge);
            g.nodes.delete(node);
        }
    }

    return undefined;
}


/**
 * @param {!ZxEdgePos} edge
 * @returns {!function(!ZxGraph)}
 */
function _delete_edge_actor(edge) {
    return g => {
        g.edges.delete(edge);
        for (let n of edge.adjacent_node_positions()) {
            if (g.nodes.has(n) && g.edges_of(n).length === 0) {
                g.nodes.delete(n);
            }
        }
    }
}

/**
 * @param {!ZxNodePos|!ZxEdgePos} element
 * @returns {undefined|!function(!ZxGraph)}
 */
function deleter(element) {
    if (!curGraph.has(element)) {
        return undefined;
    }

    if (element instanceof ZxNodePos) {
        let ext = contracter(element);
        if (ext !== undefined) {
            return ext;
        }

        return g => {
            for (let e of g.edges_of(element)) {
                _delete_edge_actor(e)(g);
            }
        };
    } else if (element instanceof ZxEdgePos) {
        let exts = element.adjacent_node_positions().map(contracter);
        let ext = seq(exts).filter(e => e !== undefined).single(null);
        if (ext !== null) {
            return ext;
        }

        return _delete_edge_actor(element);
    }
}


/**
 * @param {!ZxNodePos|!ZxEdgePos} edge
 * @returns {undefined|!function(!ZxGraph)}
 */
function pickEditAction(ev) {
    if (ev.which !== 1 && ev.which !== 2) {
        return;
    }

    let [x, y] = eventPosRelativeTo(ev, canvasDiv);
    let {element} = xyToGraphElement(x, y);
    if (element === undefined) {
        return undefined;
    }

    let wantDelete = ev.which === 2 || ev.ctrlKey;
    if (wantDelete) {
        ev.preventDefault()
        return deleter(element);
    }

    if (element instanceof ZxNodePos) {
        if (!curGraph.nodes.has(element)) {
            let exts = element.adjacent_edge_positions().map(extender);
            let ext = seq(exts).filter(e => e !== undefined).single(null);
            if (ext !== null) {
                return ext;
            }
            return undefined;
        }

        let cycle = ['O', '@', 'in', 'out'];
        let kind = curGraph.nodes.get(element);
        let i = cycle.indexOf(kind);
        if (i !== -1) {
            i++;
            i %= cycle.length;
            if (i >= 2 && curGraph.edges_of(element).length !== 1) {
                i = 0;
            }
            return g => {
                g.nodes.set(element, cycle[i]);
            };
        }
        return undefined;
    }

    if (element instanceof ZxEdgePos) {
        if (curGraph.edges.has(element)) {
            let cycle = ['-', 'h'];
            let kind = curGraph.kind(element);
            let i = cycle.indexOf(kind);
            if (i !== -1) {
                i++;
                i %= cycle.length;
                return g => {
                    g.edges.set(element, cycle[i]);
                };
            }
            return undefined;
        }

        let ext = extender(element);
        if (ext !== undefined) {
            return ext;
        }

        let hasBlockingNeighbor = false;
        for (let n of element.adjacent_node_positions()) {
            if (curGraph.nodes.get(n) === 'in' || curGraph.nodes.get(n) === 'out') {
                hasBlockingNeighbor = true;
            }
        }
        if (!hasBlockingNeighbor) {
            return g => {
                g.edges.set(element, '-');
                for (let n of element.adjacent_node_positions()) {
                    if (!g.nodes.has(n)) {
                        g.nodes.set(n, 'O');
                    }
                }
            };
        }

        return undefined;
    }
}

canvasDiv.addEventListener('mousedown', ev => {
    let edit = pickEditAction(ev);
    if (edit !== undefined) {
        let g = curGraph.copy();
        edit(g);
        revision.commit(g.serialize());
    }
});

canvasDiv.addEventListener('mousemove', ev => {
    [mouseX, mouseY] = eventPosRelativeTo(ev, canvasDiv);
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

document.addEventListener('keydown', ev => {
    let handlers = keyListeners.get(ev.keyCode);
    if (handlers !== undefined) {
        ev.preventDefault();
        for (let handler of handlers) {
            handler(ev);
        }
    }
});
