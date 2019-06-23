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
            for (let n of edge.adjacent_node_positions()) {
                if (graph.nodes.has(n) && graph.edges_of(n).length === 0) {
                    graph.nodes.delete(n);
                }
            }
        },
        (graph, ctx) => {
            let [n1, n2] = edge.adjacent_node_positions();
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
                if (graph.edges_of(n).length === 1) {
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
 * Removes a node from the graph, along with its edges.
 * @param {!ZxNode} node
 * @returns {!Edit}
 */
function removeNodeEdit(node) {
    return new Edit(
        () => `delete ${node} and its edges.`,
        graph => {
            for (let e of graph.edges_of(node)) {
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

            for (let e of graph.edges_of(node)) {
                let [n1, n2] = e.adjacent_node_positions();
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


export {Edit, removeEdgeEdit, removeNodeEdit};
