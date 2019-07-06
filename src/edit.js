/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
import {Revision} from "src/base/Revision.js";
import {Reader, Writer} from "src/base/Serialize.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {ZxGraph, ZxEdge, ZxNode, ZxPort} from "src/sim/ZxGraph.js";
import {evalZxGraph} from "src/sim/ZxGraphEval.js";
import {Util} from "src/base/Util.js";
import {MathPainter} from "src/MathPainter.js";
import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {Seq, seq} from "src/base/Seq.js";


class Edit {
    /**
     * @param {!function() : !string} describe
     * @param {!function(!ZxGraph)} action
     * @param {!function(!ZxGraph, !CanvasRenderingContext2D)} preview
     */
    constructor(describe, action, preview) {
        this.describe = describe;
        this.action = action;
        this.drawPreview = preview;
    }

    toString() {
        return `Edit: ${this.describe()}`
    }
}


/**
 * @param {!ZxNode} n
 * @returns {![!number, !number]}
 */
function nodeToXy(n) {
    return [-100 + n.x * 50, -100 + n.y * 50];
}

/**
 * Removes an edge from the graph, along with its leaf nodes.
 * @param {!ZxEdge} edge
 * @returns {!Edit}
 */
function removeEdgeEdit(edge) {
    return new Edit(
        () => `delete ${edge} and its leaf nodes`,
        graph => {
            graph.edges.delete(edge);
            for (let n of edge.nodes()) {
                if (graph.nodes.has(n) && graph.activeUnitEdgesOf(n).length === 0) {
                    graph.nodes.delete(n);
                }
            }
        },
        (graph, ctx) => {
            let [n1, n2] = edge.nodes();
            let [x1, y1] = nodeToXy(n1);
            let [x2, y2] = nodeToXy(n2);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.globalAlpha *= 0.5;
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 3;
            ctx.globalAlpha *= 2;
            ctx.stroke();

            for (let n of [n1, n2]) {
                if (graph.activeUnitEdgesOf(n).length === 1) {
                    ctx.beginPath();
                    ctx.arc(...nodeToXy(n), 4, 0, 2*Math.PI);
                    ctx.fillStyle = 'red';
                    ctx.globalAlpha *= 0.5;
                    ctx.fill();
                    ctx.globalAlpha *= 2;
                }
            }
        });
}

/**
 * Removes an edge from the graph, along with its leaf nodes.
 * @param {!ZxGraph} graphAtFocusTime
 * @param {!ZxEdge} edge
 * @returns {undefined|!Edit}
 */
function maybeRemoveEdgeModifier(graphAtFocusTime, edge) {
    let kind = graphAtFocusTime.kind(edge);
    if (kind === undefined || kind === '-') {
        return undefined;
    }

    return new Edit(
        () => `remove modified on ${edge}`,
        graph => {
            graph.edges.set(edge, '-');
        },
        (graph, ctx) => {
            let [n1, n2] = edge.nodes();
            let [x1, y1] = nodeToXy(n1);
            let [x2, y2] = nodeToXy(n2);
            let [cx, cy] = [(x1+x2)/2, (y1+y2)/2];

            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, 2*Math.PI);
            ctx.fillStyle = 'red';
            ctx.globalAlpha *= 0.5;
            ctx.fill();
            ctx.globalAlpha *= 2;
        });
}

/**
 * Removes an edge from the graph, along with its leaf nodes.
 * @param {!ZxGraph} graphAtFocusTime
 * @param {!ZxEdge|!ZxNode} elementOnPath
 * @returns {undefined|!Edit}
 */
function maybeRemoveConnectingPathEdit(graphAtFocusTime, elementOnPath) {
    let path = graphAtFocusTime.extendedUnblockedPath(elementOnPath, false);
    if (path.size === 0) {
        return undefined;
    }

    return new Edit(
        () => `delete connecting path touching ${elementOnPath}`,
        graph => graph.deletePath(path),
        (graph, ctx) => {
            for (let edge of path) {
                let [n1, n2] = edge.nodes();
                let [x1, y1] = nodeToXy(n1);
                let [x2, y2] = nodeToXy(n2);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.globalAlpha *= 0.5;
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 3;
                ctx.globalAlpha *= 2;
                ctx.stroke();
            }
        });
}

/**
 * Removes a node from the graph, along with its edges.
 * @param {!ZxGraph} graphAtFocusTime
 * @param {!ZxNode} node
 * @returns {!Edit}
 */
function maybeContractNodeEdit(graphAtFocusTime, node) {
    let kind = graphAtFocusTime.kind(node);
    let degree = graphAtFocusTime.activeUnitEdgesOf(node).length;
    if (kind === undefined || kind === '+' || degree % 2 === 1) {
        return undefined;
    }

    return new Edit(
        () => `contract ${node} to a crossing.`,
        graph => {
            if (degree === 0) {
                graph.nodes.delete(node);
            } else {
                graph.nodes.set(node, '+');
            }
        },
        (graph, ctx) => {
            ctx.beginPath();
            ctx.arc(...nodeToXy(node), 4, 0, 2*Math.PI);
            ctx.fillStyle = 'red';
            ctx.globalAlpha *= 0.5;
            ctx.fill();
            ctx.globalAlpha *= 2;
        })
}

/**
 * @param {!Iterable.<!ZxEdge>|!GeneralSet<!ZxEdge>} edgePath
 * @returns {!ZxEdge}
 */
function edgePathToEdge(edgePath) {
    let seen = new GeneralSet();
    let seenOnce = new GeneralSet();
    for (let edge of edgePath) {
        for (let n of edge.nodes()) {
            if (seen.has(n)) {
                seenOnce.delete(n);
            } else {
                seen.add(n);
                seenOnce.add(n);
            }
        }
    }
    if (seenOnce.size !== 2) {
        throw new Error(`Not a path: ${edgePath}. Wrong endpoint count: ${seenOnce}`);
    }
    return new ZxEdge(...seenOnce);
}

/**
 * Removes a node from the graph, along with its edges.
 * @param {!ZxGraph} graphAtFocusTime
 * @param {!ZxNode} oldPos
 * @param {!ZxNode} newPos
 * @returns {!Edit}
 */
function maybeDragNodeEdit(graphAtFocusTime, oldPos, newPos) {
    if (newPos.isEqualTo(oldPos)) {
        return undefined;
    }
    let nodeKind = graphAtFocusTime.kind(oldPos);
    if (nodeKind === undefined) {
        return undefined;
    }

    let ports = graphAtFocusTime.activePortsOf(oldPos);
    let copy = graphAtFocusTime.copy();
    if (nodeKind === '+') {
        copy.nodes.set(oldPos, 'O'); // Temporarily change to a normal node to avoid double-deletes.
    }
    let tasks = [];
    let dx = newPos.x - oldPos.x;
    let dy = newPos.y - oldPos.y;
    let oldPaths = [];
    for (let port of ports) {
        if (!copy.has(port.edge)) {
            return undefined;
        }
        let extended = copy.extendedUnblockedPath(port.edge);
        copy.deletePath(extended);
        let oppNode = edgePathToEdge(extended).opposite(port.node);
        tasks.push([port.translate(dx, dy), oppNode]);
        oldPaths.push(extended);
    }
    if (copy.has(newPos)) {
        return undefined;
    }
    copy.nodes.delete(oldPos);
    copy.nodes.set(newPos, nodeKind);

    let newPaths = [];
    for (let [port, oppNode] of tasks) {
        let path = copy.tryFindFreePath(port, oppNode);
        if (path === undefined) {
            return undefined;
        }
        for (let edge of path) {
            if (copy.has(edge)) {
                throw new Error('Double edged.');
            }
            copy.edges.set(edge, '-');
            for (let node of edge.nodes()) {
                if (!copy.has(node)) {
                    copy.nodes.set(node, '+');
                }
            }
        }
        newPaths.push(path);
    }

    return new Edit(
        () => `move ${oldPos} to ${newPos}.`,
        graph => {
            graph.nodes = copy.nodes;
            graph.edges = copy.edges;
        },
        (graph, ctx) => {
            for (let p of oldPaths) {
                for (let e of p) {
                    let [n1, n2] = e.nodes();
                    let [x1, y1] = nodeToXy(n1);
                    let [x2, y2] = nodeToXy(n2);
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.globalAlpha *= 0.5;
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 3;
                    ctx.globalAlpha *= 2;
                    ctx.stroke();
                }
            }
            for (let p of newPaths) {
                for (let e of p) {
                    let [n1, n2] = e.nodes();
                    let [x1, y1] = nodeToXy(n1);
                    let [x2, y2] = nodeToXy(n2);
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = 'blue';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }
            }
        })
}

/**
 * Removes a node from the graph, along with its edges.
 * @param {!ZxNode} node
 * @returns {!Edit}
 */
function removeNodeEdit(node) {
    return new Edit(
        () => `delete ${node} and its edges.`,
        graph => {
            for (let e of graph.activeUnitEdgesOf(node)) {
                removeEdgeEdit(e).action(graph);
            }
        },
        (graph, ctx) => {
            ctx.beginPath();
            ctx.arc(...nodeToXy(node), 4, 0, 2*Math.PI);
            ctx.fillStyle = 'red';
            ctx.globalAlpha *= 0.5;
            ctx.fill();
            ctx.globalAlpha *= 2;

            for (let e of graph.activeUnitEdgesOf(node)) {
                let [n1, n2] = e.nodes();
                let [x1, y1] = nodeToXy(n1);
                let [x2, y2] = nodeToXy(n2);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.globalAlpha *= 0.5;
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 3;
                ctx.globalAlpha *= 2;
                ctx.stroke();
            }
        })
}


export {
    Edit,
    removeEdgeEdit,
    removeNodeEdit,
    maybeRemoveConnectingPathEdit,
    maybeContractNodeEdit,
    maybeRemoveEdgeModifier,
    maybeDragNodeEdit,
};
