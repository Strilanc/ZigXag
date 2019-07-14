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
import {NODES} from "src/nodes/All.js";
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
 * @param {!ZxNode|!ZxEdge} element
 * @param {!string} kind
 * @returns {undefined|!Edit}
 */
function setElementKindEdit(element, kind) {
    return new Edit(
        () => `set ${element} kind to ${kind}`,
        graph => graph.setKind(element, kind),
        (graph, ctx) => {
            let nodeKind = NODES.map.get(kind);
            ctx.save();
            ctx.translate(...graphElementToCenterXy(element));
            if (nodeKind !== undefined) {
                nodeKind.contentDrawer(ctx);
            }
            ctx.restore();
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
 * @param {!ZxGraph} graph
 * @param {!ZxNode} start
 * @param {!Array.<!ZxNode>} ends
 * @returns {undefined|!{newGraph: !ZxGraph, newPaths: !Array.<!Array.<!ZxEdge>>}
 * @private
 */
function _multiPath_allOrders(graph, start, ends) {
    // Ensure tie breakers always go the same way.
    ends = [...ends];
    ends.sort((a, b) => a.orderVal() - b.orderVal());

    // Optimize over all orderings.
    let result = seq(ends).
        permutations().
        map(ordering => _multiPath_fixedOrder(graph, start, ordering)).
        filter(result => result !== undefined).
        minBy(e => e.newPathLen, null);

    // Package result.
    if (result === null) {
        return undefined;
    }
    return result;
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxNode} start
 * @param {!Array.<!ZxNode>} ends
 * @returns {undefined|!{newGraph: !ZxGraph, newPaths: !Array.<!Array.<!ZxEdge>>}
 * @private
 */
function _multiPath_fixedOrder(graph, start, ends) {
    let newGraph = graph.copy();
    let newPaths = /* @type {!Array.<!Array.<!ZxEdge>>} */ [];
    let newPathLen = 0;
    for (let oppNode of ends) {
        let path = newGraph.tryFindFreePath(start, oppNode);
        if (path === undefined) {
            return undefined;
        }
        newPaths.push(path);
        newPathLen += path.length;

        for (let edge of path) {
            if (newGraph.has(edge)) {
                throw new Error('Double edged.');
            }
            newGraph.edges.set(edge, '-');
            for (let node of edge.nodes()) {
                if (!newGraph.has(node)) {
                    newGraph.nodes.set(node, '+');
                }
            }
        }
    }
    return {
        newPathLen,
        newPaths,
        newGraph,
    };
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxNode} node
 * @param {!boolean} includingOrphansThatCannotBeSingletons
 * @returns {!{newGraph: !ZxGraph, endOfRemovedPathNodes: !Array.<!ZxNode>, removedEdges: !Array.<!ZxEdge>}}
 * @private
 */
function _deleteNodeAndAttachedEdges(graph, node, includingOrphansThatCannotBeSingletons) {
    let ports = graph.activePortsOf(node);
    let newGraph = graph.copy();
    if (graph.kind(node) === '+') {
        newGraph.nodes.set(node, 'O'); // Temporarily change to a normal node to avoid double-deletes.
    }
    let endOfRemovedPathNodes = /* @type {!Array.<!ZxNode>} */ [];
    let removedEdges = /* @type {!Array.<!ZxEdge>} */ [];
    for (let port of ports) {
        if (!newGraph.has(port.edge)) {
            return undefined;
        }
        let extended = newGraph.extendedUnblockedPath(port.edge);
        removedEdges.push(...extended);
        newGraph.deletePath(extended, false);
        let oppNode = edgePathToEdge(extended).opposite(port.node);
        let newDegree = newGraph.activeUnitEdgesOf(oppNode).length;
        let oppNodeKind = newGraph.nodeKind(oppNode);
        let allowedDegrees = oppNodeKind === undefined ? [0] : oppNodeKind.allowedDegrees;

        if (includingOrphansThatCannotBeSingletons && newDegree === 0 && allowedDegrees.indexOf(0) === -1) {
            newGraph.nodes.delete(oppNode);
        } else {
            endOfRemovedPathNodes.push(oppNode);
        }
    }
    newGraph.nodes.delete(node);
    return {newGraph, endOfRemovedPathNodes, removedEdges}
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

    let del = _deleteNodeAndAttachedEdges(graphAtFocusTime, oldPos, false);
    if (del.newGraph.has(newPos)) {
        return undefined;
    }
    del.newGraph.nodes.set(newPos, nodeKind);

    let result = _multiPath_allOrders(del.newGraph, newPos, del.endOfRemovedPathNodes);
    if (result === undefined) {
        return undefined;
    }

    return new Edit(
        () => `move ${oldPos} to ${newPos}.`,
        graph => {
            graph.nodes = result.newGraph.nodes;
            graph.edges = result.newGraph.edges;
        },
        (graph, ctx) => {
            for (let e of del.removedEdges) {
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
            for (let p of result.newPaths) {
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
            let result = _deleteNodeAndAttachedEdges(graph, node, true);
            graph.nodes = result.newGraph.nodes;
            graph.edges = result.newGraph.edges;
        },
        (graph, ctx) => {
            let result = _deleteNodeAndAttachedEdges(graph, node, true);

            ctx.beginPath();
            ctx.arc(...nodeToXy(node), 4, 0, 2*Math.PI);
            ctx.fillStyle = 'red';
            ctx.globalAlpha *= 0.5;
            ctx.fill();
            ctx.globalAlpha *= 2;

            for (let e of result.removedEdges) {
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
    setElementKindEdit,
};
