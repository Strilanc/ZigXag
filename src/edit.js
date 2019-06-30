/**
 * Entry point for the whole program.
 */

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
import {Revision} from "src/base/Revision.js";
import {Reader, Writer} from "src/base/Serialize.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js";
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
        graph => {
            for (let e of path) {
                graph.edges.delete(e);
            }
            for (let e of path) {
                for (let n of e.nodes()) {
                    if (graph.kind(n) === '+' && graph.activeUnitEdgesOf(n).length === 0) {
                        graph.nodes.delete(n);
                    }
                }
            }
        },
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
    let kind = graphAtFocusTime.has(node);
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
};
