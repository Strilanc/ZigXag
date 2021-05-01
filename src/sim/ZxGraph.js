import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {Seq, seq} from "src/base/Seq.js";
import {NODES} from "src/nodes/All.js";
import {Graph} from "src/base/Graph.js";


class ZxNode {
    /**
     * @param {!int} x
     * @param {!int} y
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * @returns {!Array.<!ZxEdge>}
     */
    unitEdges() {
        return [
            this.rightUnitEdge(),
            this.upUnitEdge(),
            this.leftUnitEdge(),
            this.downUnitEdge(),
        ];
    }

    /**
     * @param {!ZxEdge} unitEdge
     * @returns {!ZxEdge}
     */
    oppositeUnitEdge(unitEdge) {
        if (unitEdge.isEqualTo(this.leftUnitEdge())) {
            return this.rightUnitEdge();
        }
        if (unitEdge.isEqualTo(this.rightUnitEdge())) {
            return this.leftUnitEdge();
        }
        if (unitEdge.isEqualTo(this.upUnitEdge())) {
            return this.downUnitEdge();
        }
        if (unitEdge.isEqualTo(this.downUnitEdge())) {
            return this.upUnitEdge();
        }
        throw new Error('Not an adjacent unit edge.');
    }

    /**
     * Returns the result of rotating this node 180 degrees around the given node.
     * @param {!ZxNode} node
     * @returns {!ZxNode}
     */
    reflectedThrough(node) {
        let dx = this.x - node.x;
        let dy = this.y - node.y;
        return node.translate(-dx, -dy);
    }

    /**
     * @param {!int} dx
     * @param {!int} dy
     * @returns {!ZxNode}
     */
    translate(dx, dy) {
        return new ZxNode(this.x + dx, this.y + dy);
    }

    /**
     * @returns {!Array.<!ZxPort>}
     */
    unitPorts() {
        return this.unitEdges().map(e => new ZxPort(e, this));
    }

    /**
     * @returns {!ZxEdge}
     */
    rightUnitEdge() {
        return ZxEdge.makeHorizontalUnit(this.x, this.y);
    }

    /**
     * @returns {!ZxEdge}
     */
    downUnitEdge() {
        return ZxEdge.makeVerticalUnit(this.x, this.y);
    }

    /**
     * @returns {!ZxEdge}
     */
    leftUnitEdge() {
        return ZxEdge.makeHorizontalUnit(this.x - 1, this.y);
    }

    /**
     * @returns {!ZxPort}
     */
    rightPort() {
        return new ZxPort(this.rightUnitEdge(), this);
    }

    /**
     * @returns {!ZxPort}
     */
    leftPort() {
        return new ZxPort(this.leftUnitEdge(), this);
    }

    /**
     * @returns {!ZxPort}
     */
    downPort() {
        return new ZxPort(this.downUnitEdge(), this);
    }

    /**
     * @returns {!ZxPort}
     */
    upPort() {
        return new ZxPort(this.upUnitEdge(), this);
    }

    /**
     * @returns {!ZxEdge}
     */
    upUnitEdge() {
        return ZxEdge.makeVerticalUnit(this.x, this.y - 1);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `(${this.x},${this.y})`;
    }

    /**
     * @returns {!number}
     */
    orderVal() {
        return this.x + this.y * 1000.1;
    }

    /**
     * @returns {!number}
     */
    orderValXThenY() {
        return this.x * 1000.1 + this.y;
    }

    /**
     * @param {object|!ZxNode} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxNode)) {
            return false;
        }
        return this.x === other.x && this.y === other.y;
    }
}


class ZxEdge {
    /**
     * @param {!ZxNode} n1
     * @param {!ZxNode} n2
     */
    constructor(n1, n2) {
        if (!(n1 instanceof ZxNode)) {
            throw new Error(`Not a ZxNode: ${n1}`);
        }
        if (!(n2 instanceof ZxNode)) {
            throw new Error(`Not a ZxNode: ${n2}`);
        }
        if (n1.orderVal() > n2.orderVal()) {
            [n1, n2] = [n2, n1];
        }
        this.n1 = n1;
        this.n2 = n2;
    }

    /**
     * Returns the result of rotating this edge 180 degrees around the given node.
     * @param {!ZxNode} node
     * @returns {!ZxEdge}
     */
    reflectedThrough(node) {
        return new ZxEdge(this.n1.reflectedThrough(node), this.n2.reflectedThrough(node));
    }

    /**
     * @param {!int} dx
     * @param {!int} dy
     * @returns {!ZxEdge}
     */
    translate(dx, dy) {
        return new ZxEdge(this.n1.translate(dx, dy), this.n2.translate(dx, dy));
    }

    /**
     * @param {!ZxEdge|!ZxNode} element
     * @returns {undefined|!ZxNode|!ZxEdge}
     */
    intersection(element) {
        if (element instanceof ZxNode) {
            if (this.n1.isEqualTo(element) || this.n2.isEqualTo(element)) {
                return element;
            }
            return undefined;
        }

        if (element instanceof ZxEdge) {
            if (this.isEqualTo(element)) {
                return element;
            }
            return this.intersection(element.n1) || this.intersection(element.n2);
        }

        throw new Error(`Unrecognized graph element: ${element}`);
    }

    /**
     * @param {!int} x
     * @param {!int} y
     * @param {!boolean} horizontal
     * @returns {!ZxEdge}
     */
    static makeUnit(x, y, horizontal) {
        return horizontal ? this.makeHorizontalUnit(x, y) : this.makeVerticalUnit(x, y);
    }

    /**
     * @param {!int} x
     * @param {!int} y
     * @returns {!ZxEdge}
     */
    static makeHorizontalUnit(x, y) {
        return new ZxEdge(new ZxNode(x, y), new ZxNode(x + 1, y));
    }

    /**
     * @param {!int} x
     * @param {!int} y
     * @returns {!ZxEdge}
     */
    static makeVerticalUnit(x, y) {
        return new ZxEdge(new ZxNode(x, y), new ZxNode(x, y + 1));
    }

    /**
     * @returns {!boolean}
     */
    isUnit() {
        let dx = Math.abs(this.n1.x - this.n2.x);
        let dy = Math.abs(this.n1.y - this.n2.y);
        return dx + dy === 1;
    }

    /**
     * @returns {!Array.<!ZxNode>}
     */
    nodes() {
        return [this.n1, this.n2];
    }

    /**
     * @returns {!Array.<!ZxPort>}
     */
    ports() {
        return this.nodes().map(n => new ZxPort(this, n));
    }

    /**
     * @param {!ZxNode} node
     * @returns {!ZxNode}
     */
    opposite(node) {
        let nodes = this.nodes();
        if (node.isEqualTo(nodes[0])) {
            return nodes[1];
        }
        if (node.isEqualTo(nodes[1])) {
            return nodes[0];
        }
        throw new Error(`${node} is not an endpoint of ${this}`);
    }

    /**
     * @returns {!number}
     */
    orderVal() {
        return this.n1.orderVal() * 1000000.2 + this.n2.orderVal();
    }

    /**
     * @returns {!number}
     */
    orderValXThenY() {
        return this.n1.orderValXThenY() * 1000000.2 + this.n2.orderValXThenY();
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `(${this.n1}, ${this.n2})`;
    }

    /**
     * @param {object|!ZxEdge} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxEdge)) {
            return false;
        }
        return this.n1.isEqualTo(other.n1) && this.n2.isEqualTo(other.n2);
    }
}


/**
 * The location where an edge is entering into a node. An adjacent edge/node combination.
 */
class ZxPort {
    /**
     * @param {!ZxEdge} edge
     * @param {!ZxNode} node
     */
    constructor(edge, node) {
        if (!(edge instanceof ZxEdge)) {
            throw new Error(`Not a ZxNode: ${edge}`);
        }
        if (!(node instanceof ZxNode)) {
            throw new Error(`Not a ZxNode: ${node}`);
        }
        this.edge = edge;
        this.node = node;
    }

    /**
     * @param {!int} dx
     * @param {!int} dy
     * @returns {!ZxPort}
     */
    translate(dx, dy) {
        return new ZxPort(this.edge.translate(dx, dy), this.node.translate(dx, dy));
    }

    /**
     * @returns {!ZxPort}
     */
    opposite() {
        return new ZxPort(this.edge, this.edge.opposite(this.node));
    }

    /**
     * @returns {!ZxPort}
     */
    oppositeSideOfNode() {
        return new ZxPort(this.node.oppositeUnitEdge(this.edge), this.node);
    }

    /**
     * @param {object|!ZxPort} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxPort)) {
            return false;
        }
        return other.edge.isEqualTo(this.edge) && other.node.isEqualTo(this.node);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `${this.edge}@${this.node}`;
    }
}


class ZxGraph {
    /**
     * @param {!GeneralMap.<!ZxNode, !string>=} nodes
     * @param {!GeneralMap.<!ZxEdge, !string>=} edges
     */
    constructor(nodes=undefined, edges=undefined) {
        if (nodes === undefined) {
            nodes = new GeneralMap();
        }
        if (edges === undefined) {
            edges = new GeneralMap();
        }
        this.nodes = nodes;
        this.edges = edges;
    }

    /**
     * @param {!ZxNode} node
     */
    isExternalNodeKind(node) {
        let kind = this.kind(node);
        return ['out', 'in', 'O!', '@!'].indexOf(kind) !== -1;
    }

    /**
     * @param {!ZxNode|!ZxEdge} nodeOrEdge
     * @returns {!boolean}
     */
    has(nodeOrEdge) {
        let map = (nodeOrEdge instanceof ZxNode) ? this.nodes : this.edges;
        return map.has(nodeOrEdge);
    }

    /**
     * @param {!ZxNode|!ZxEdge} nodeOrEdge
     * @returns {undefined|!string}
     */
    kind(nodeOrEdge) {
        let map = (nodeOrEdge instanceof ZxNode) ? this.nodes : this.edges;
        return map.get(nodeOrEdge);
    }

    /**
     * @param {!ZxNode|!ZxEdge} nodeOrEdge
     * @returns {undefined|!ZxNodeKind}
     */
    nodeKind(nodeOrEdge) {
        let kind = this.kind(nodeOrEdge);
        if (kind === undefined) {
            return undefined;
        }
        return NODES.map.get(kind);
    }

    /**
     * @param {!ZxNode|!ZxEdge} element
     * @param {!string} kind
     */
    setKind(element, kind) {
        let map = (element instanceof ZxNode) ? this.nodes : this.edges;
        map.set(element, kind);
    }

    /**
     * @returns {!ZxGraph}
     */
    movedToOrigin() {
        let {x, y} = this.boundingBox();
        return this.shifted(-x, -y);
    }

    /**
     * @returns {!string}
     */
    serialize() {
        let nodes = this.sortedNodes();
        let edges = this.sortedEdges();
        let nodeText = nodes.map(n => `${n.x},${n.y},${this.kind(n)}`).join(';');
        let edgeText = edges.map(e => {
            if (!e.isUnit() || e.n1.x > e.n2.x || e.n1.y > e.n2.y) {
                throw new Error(`Non-unit edge: ${e}`);
            }
            return `${e.n1.x},${e.n1.y},${e.n2.x},${e.n2.y},${this.kind(e)}`;
        }).join(';');
        return `${nodeText}:${edgeText}`;
    }

    /**
     * @returns {!ZxGraph}
     */
    copy() {
        return ZxGraph.deserialize(this.serialize());
    }

    /**
     * @returns {!Graph}
     */
    toAdjGraph() {
        let g = new Graph();
        let nodeMap = /** @type {!GeneralMap.<!ZxPort, Node>} */ new GeneralMap();

        for (let node of this.sortedNodes()) {
            let kind = this.kind(node);
            if (kind !== '+') {
                let n = g.addNode({source: node, kind});
                for (let port of this.activePortsOf(node)) {
                    nodeMap.set(port, n);
                }
            } else {
                let pairs = this.activeCrossingPortPairs(node);
                for (let [a, b] of pairs) {
                    let source = pairs.length === 1 ? node : a;
                    let n = g.addNode({source, kind: '@'});
                    nodeMap.set(a, n);
                    nodeMap.set(b, n);
                }
            }
        }
        for (let edge of this.sortedEdges()) {
            let kind = this.kind(edge);
            let [p1, p2] = edge.ports();
            let n1 = nodeMap.get(p1);
            let n2 = nodeMap.get(p2);
            n1.addEdgeTo(n2, {source: edge, kind});
        }
        return g;
    }

    /**
     * @param {!string} text
     * @returns {!ZxGraph}
     */
    static deserialize(text) {
        let result = new ZxGraph();

        function parseNode(t) {
            let [x, y, k] = t.split(',');
            let n = new ZxNode(parseInt(x), parseInt(y));
            result.nodes.set(n, k);
        }

        function parseEdge(t) {
            let [x1, y1, x2, y2, k] = t.split(',');
            let e = new ZxEdge(
                new ZxNode(parseInt(x1), parseInt(y1)),
                new ZxNode(parseInt(x2), parseInt(y2)));
            result.edges.set(e, k);
        }

        if (text.length > 0) {
            let [nodeText, edgeText] = text.split(':');
            if (nodeText.length > 0) {
                nodeText.split(';').map(parseNode);
            }
            if (edgeText.length > 0) {
                edgeText.split(';').map(parseEdge);
            }
        }

        return result;
    }

    /**
     * @returns {!Array.<!ZxNode>}
     */
    inputNodes() {
        let result = [];
        for (let node of this.sortedNodes()) {
            let kind = this.nodes.get(node);
            if (kind === 'in') {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * @returns {!Array.<!{node: !ZxNode, axis: !boolean}>}
     */
    spiderNodesWithAxis() {
        let result = [];
        for (let node of this.sortedNodes()) {
            let kind = this.nodes.get(node);
            if (kind === 'O' || kind === 'w' || kind === 'f' || kind === 'x') {
                result.push({node, axis: true});
            } else if (kind === '@' || kind === 's' || kind === 'a' || kind === 'z') {
                result.push({node, axis: false});
            }
        }
        return result;
    }

    /**
     * Ordered top to bottom, then left to right.
     * @returns {!Array.<!ZxNode>}
     */
    sortedNodes() {
        let nodes = [...this.nodes.keys()];
        nodes.sort((a, b) => a.orderVal() - b.orderVal());
        return nodes;
    }

    /**
     * Ordered top to bottom, then left to right.
     * @returns {!Array.<!ZxEdge>}
     */
    sortedEdges() {
        let edges = [...this.edges.keys()];
        edges.sort((a, b) => a.orderVal() - b.orderVal());
        return edges;
    }

    /**
     * Applies trivial rewrites to simplify the ZX graph.
     * @returns {!ZxGraph} this
     */
    inlineSimplify() {
        for (let {node} of this.spiderNodesWithAxis()) {
            let edges = this.activeEdgesOf(node);
            if (edges.length === 2) {
                let [e1, e2] = edges;
                if (this.kind(e1) === '-' && this.kind(e2) === '-') {
                    let n1 = e1.opposite(node);
                    let n2 = e2.opposite(node);
                    this.edges.delete(e1);
                    this.edges.delete(e2);
                    this.nodes.delete(node);
                    this.edges.set(new ZxEdge(n1, n2), '-');
                }
            }
        }
        return this;
    }

    /**
     * @param {!int} xFactor
     * @param {!int} yFactor
     * @returns {!ZxGraph}
     */
    scaled(xFactor, yFactor) {
        let f = n => new ZxNode(n.x * xFactor, n.y * yFactor);
        let newNodes = new GeneralMap();
        let newEdges = new GeneralMap();
        for (let [n, kind] of this.nodes.entries()) {
            newNodes.set(f(n), kind);
        }
        for (let [e, kind] of this.edges.entries()) {
            let n = f(e.n1);
            if (e.n2.x !== e.n1.x) {
                for (let i = 0; i < xFactor; i++) {
                    let n1 = n.translate(i, 0);
                    newEdges.set(new ZxEdge(n1, n.translate(i + 1, 0)), kind);
                    if (i !== 0) {
                        newNodes.set(n1, '+')
                    }
                }
            } else {
                for (let i = 0; i < yFactor; i++) {
                    let n1 = n.translate(0, i);
                    newEdges.set(new ZxEdge(n1, n.translate(0, i + 1)), kind);
                    if (i !== 0) {
                        newNodes.set(n1, '+')
                    }
                }
            }
        }
        return new ZxGraph(newNodes, newEdges);
    }

    /**
     * Removes columns and rows that are only being used as pass throughs.
     *
     * @returns {{graph: !ZxGraph, xMap: !Map.<!int, !int>, yMap: !Map.<!int, !int>}}
     */
    autoCompressed() {
        let importantNodes = seq(this.nodes.keys()).filter(n => !this.isStraightEdgeNode(n)).toArray();
        let xs = seq(importantNodes).map(n => n.x).distinct().sorted().toArray();
        let ys = seq(importantNodes).map(n => n.y).distinct().sorted().toArray();
        let xMap = Seq.range(xs.length).toMap(i => xs[i], i => i);
        let yMap = Seq.range(ys.length).toMap(i => ys[i], i => i);
        let newNodes = new GeneralMap();
        let f = n => new ZxNode(xMap.get(n.x), yMap.get(n.y));
        for (let [n, kind] of this.nodes.entries()) {
            if (xMap.has(n.x) && yMap.has(n.y)) {
                newNodes.set(f(n), kind);
            }
        }
        let newEdges = new GeneralMap();
        for (let [e, kind] of this.edges.entries()) {
            if (xMap.has(e.n1.x) && yMap.has(e.n1.y)) {
                let n = f(e.n1);
                let dx = e.n2.x - e.n1.x;
                let dy = e.n2.y - e.n1.y;
                newEdges.set(new ZxEdge(n, n.translate(dx, dy)), kind);
            }
        }
        return {
            graph: new ZxGraph(newNodes, newEdges),
            xMap,
            yMap,
        };
    }


    /**
     * @param {!string} text
     * @returns {!ZxGraph}
     */
    static fromDiagram(text) {
        let lines = text.split('\n');

        // Drop blank leading and trailing lines.
        while (lines.length > 0 && lines[0].trim() === '') {
            lines.shift();
        }
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }

        // Drop indentation and trailing spaces.
        let indent = Math.min(...lines.filter(e => e.trim() !== '').map(e => rtrim(e).length - e.trim().length));
        lines = lines.map(e => rtrim(e.substr(indent)));
        if (lines.length === 0) {
            return new ZxGraph();
        }

        // Consistency checks.
        if (lines.length % 4 !== 1) {
            throw new Error(
                `Misaligned diagram. Number of non-empty lines must equal 1 mod 4, but is ${lines.length}.`);
        }
        for (let line of lines) {
            if (line !== '' && line.length % 4 !== 1 && line.length % 4 !== 2) {
                throw new Error(`Misaligned diagram. Length must equal 1 or 2 mod 4: "${line}".`);
            }
        }
        for (let row = 0; row < lines.length; row++) {
            let line = lines[row];
            for (let col = 0; col < line.length; col++) {
                if (line[col] !== ' ' && row % 4 !== 0 && col % 4 !== 0) {
                    throw new Error(`Misaligned diagram. Content outside row|col=0%4 at row=${row} col=${col}.`);
                }
                if (line[col] !== '|' && line[col] !== ' ' && row % 2 === 1) {
                    throw new Error(`Must use pipe for v edge at row=${row} col=${col}.`);
                }
                if (line[col] !== '-' && line[col] !== ' ' && col % 2 === 1) {
                    if (row % 4 !== 0 && col % 4 !== 1) {  // Allow modifier characters.
                        throw new Error(`Must use dash for h edge at row=${row} col=${col}.`);
                    }
                }
            }
        }

        /**
         * @param {!ZxEdge} edge
         * @param {!boolean} shouldBePresent
         * @param {!string} desc
         */
        function assertEdge(edge, shouldBePresent, desc) {
            let col = edge.n1.x * 4;
            let row = edge.n1.y * 4;
            let dxs = [0];
            let dys = [1, 2, 3];
            if (edge.n1.y === edge.n2.y) {
                [dxs, dys] = [dys, dxs];
            }
            for (let dy of dys) {
                let line = lines[row + dy] || '';
                for (let dx of dxs) {
                    let c = line[col + dx] || ' ';
                    if ((c !== ' ') !== shouldBePresent) {
                        throw new Error(`${desc} at row=${row+dy} col=${col+dx} "${c}".`)
                    }
                }
            }
        }

        let graph = new ZxGraph();

        let edgeKindMap = {};
        for (let nodeKind of NODES.all) {
            if (nodeKind.allowedDegrees.indexOf(2) !== -1) {
                for (let rep of nodeKind.diagramReps) {
                    edgeKindMap[rep] = nodeKind.id;
                }
            }
        }
        edgeKindMap['|'] = '-';
        edgeKindMap['-'] = '-';

        let nodeKindMap = {};
        for (let nodeKind of NODES.all) {
            for (let rep of nodeKind.diagramReps) {
                nodeKindMap[rep] = nodeKind.id;
            }
        }

        // Nodes.
        for (let row = 0; row < lines.length; row += 4) {
            let line = lines[row];
            for (let col = 0; col < line.length; col += 4) {
                let c = line[col];
                let n = new ZxNode(col >> 2, row >> 2);
                if (c === ' ') {
                    for (let e of n.unitEdges()) {
                        assertEdge(e, false, 'Nodeless edge');
                    }
                    continue;
                }

                let c2 = line[col + 1];
                if (c2 !== undefined && c2 !== '-' && c2 !== ' ') {
                    c += c2;
                }
                let kind = nodeKindMap[c];
                if (kind === undefined) {
                    throw new Error(`Unrecognized node character: "${c}".`);
                }
                graph.nodes.set(n, kind);
            }
        }

        // Vertical edges.
        for (let row = 2; row < lines.length; row += 4) {
            let line = lines[row];
            for (let col = 0; col < line.length; col += 4) {
                let c = line[col];
                let e = ZxEdge.makeVerticalUnit(col >> 2, row >> 2);
                assertEdge(e, c !== ' ', 'Broken v edge');
                if (c !== ' ') {
                    let kind = edgeKindMap[c];
                    if (kind === undefined) {
                        throw new Error(`Unrecognized edge character: "${c}".`);
                    }
                    graph.edges.set(e, kind);
                }
            }
        }

        // Horizontal edges.
        for (let row = 0; row < lines.length; row += 4) {
            let line = lines[row];
            for (let col = 2; col < line.length; col += 4) {
                let c = line[col];
                let e = ZxEdge.makeHorizontalUnit(col >> 2, row >> 2);
                assertEdge(e, c !== ' ', 'Broken h edge');
                if (c !== ' ') {
                    let kind = edgeKindMap[c];
                    if (kind === undefined) {
                        throw new Error(`Unrecognized edge character: "${c}".`);
                    }
                    graph.edges.set(e, kind);
                }
            }
        }

        return graph;
    }

    /**
     * @param {!ZxPort|!ZxNode} start
     * @param {!ZxNode} endNode
     * @returns {undefined|!Array.<!ZxEdge>}
     */
    tryFindFreePath(start, endNode) {
        let prevMap = new GeneralMap();
        let queue = /** @type {!Array.<!ZxPort>} */ [];
        let startX;
        let startY;
        if (start instanceof ZxNode) {
            startX = start.x;
            startY = start.y;
            for (let port of start.unitPorts()) {
                if (!this.edges.has(port.edge)) {
                    prevMap.set(port.edge, undefined);
                    queue.push(port);
                }
            }
        } else if (start instanceof ZxPort) {
            startX = start.node.x;
            startY = start.node.y;
            prevMap.set(start.edge, undefined);
            queue.push(start);
        }

        function trace(edge) {
            let path = [];
            while (edge !== undefined) {
                path.push(edge);
                edge = prevMap.get(edge);
            }
            return path;
        }

        let tryEnqueue = (prevEdge, oppNode, nextEdge) => {
            if (!this.has(nextEdge) && !prevMap.has(nextEdge)) {
                prevMap.set(nextEdge, prevEdge);
                queue.push(new ZxPort(nextEdge, oppNode));
            }
        };

        let box = this.boundingBox();
        let minX = Math.min(box.x, endNode.x, startX) - 4;
        let maxX = Math.max(box.x + box.w - 4, endNode.x, startX) + 4;
        let minY = Math.min(box.y, endNode.y, startY) - 4;
        let maxY = Math.max(box.y + box.h - 4, endNode.y, startY) + 4;

        while (queue.length > 0) {
            let prevPort = queue.shift();
            let prevEdge = prevPort.edge;
            let prevNode = prevPort.node;
            let oppNode = prevEdge.opposite(prevNode);
            if (oppNode.x < minX || oppNode.x > maxX || oppNode.y < minY || oppNode.y > maxY) {
                continue;
            }
            if (oppNode.isEqualTo(endNode)) {
                return trace(prevEdge);
            }

            let nodeKind = this.kind(oppNode);
            if (nodeKind === undefined) {
                let neighbors = [
                    oppNode.upUnitEdge(), oppNode.downUnitEdge(), oppNode.leftUnitEdge(), oppNode.rightUnitEdge()
                ];
                for (let nextEdge of neighbors) {
                    tryEnqueue(prevEdge, oppNode, nextEdge);
                }
            } else if (nodeKind === '+') {
                let nextEdge = prevEdge.reflectedThrough(oppNode);
                tryEnqueue(prevEdge, oppNode, nextEdge);
            }
        }

        return undefined;
    }

    /**
     * @param {!Iterable.<!ZxEdge>|!GeneralSet<!ZxEdge>} edgePath
     * @param {!boolean=true} includingOrphans
     */
    deletePath(edgePath, includingOrphans=true) {
        for (let e of edgePath) {
            this.edges.delete(e);
        }

        for (let e of edgePath) {
            for (let n of e.nodes()) {
                let kind = this.kind(n);
                if (kind === undefined) {
                    continue;
                }
                let degree = this.activeUnitEdgesOf(n).length;
                let allowedDegrees = NODES.map.get(kind).allowedDegrees;
                let remove = includingOrphans || (kind === '+' && allowedDegrees.indexOf(0) === -1);
                if (remove && degree === 0) {
                    this.nodes.delete(n);
                }
            }
        }
    }

    /**
     * @param {!ZxNode} node
     * @returns {!boolean}
     */
    isStraightEdgeNode(node) {
        if (this.kind(node) !== '+') {
            return false;
        }
        let ports = this.activePortsOf(node);
        if (ports.length !== 2) {
            return false;
        }
        if (this.kind(ports[0].edge) !== '-') {
            return false;
        }
        if (this.kind(ports[1].edge) !== '-') {
            return false;
        }
        return ports[0].oppositeSideOfNode().isEqualTo(ports[1]);
    }

    /**
     * @param {!ZxNode} node
     * @returns {!Array.<![!ZxPort, !ZxPort]>}
     */
    activeCrossingPortPairs(node) {
        if (this.kind(node) !== '+') {
            return [];
        }
        let ports = this.activePortsOf(node);
        if (ports.length !== 2 && ports.length !== 4) {
            throw new Error('Crossing node must have even degree.');
        }
        let pairs = [];
        if (ports.length === 2) {
            pairs.push(ports);
        } else {
            pairs.push([node.leftPort(), node.rightPort()]);
            pairs.push([node.upPort(), node.downPort()]);
        }
        return pairs;
    }

    /**
     * @param {!ZxNode} n
     * @returns {!Array.<!ZxEdge>}
     */
    activeEdgesOf(n) {
        if (!this.nodes.has(n)) {
            return [];
        }
        return this.sortedEdges().filter(e => e.n1.isEqualTo(n) || e.n2.isEqualTo(n));
    }

    /**
     * @param {!ZxNode} n
     * @returns {!Array.<!ZxEdge>}
     */
    activeUnitEdgesOf(n) {
        if (!this.nodes.has(n)) {
            return [];
        }
        return n.unitEdges().filter(e => this.edges.has(e));
    }

    /**
     * @param {!ZxNode|!ZxEdge} nodeOrEdge
     * @returns {!Array.<!ZxPort>}
     */
    activePortsOf(nodeOrEdge) {
        if (nodeOrEdge instanceof ZxEdge) {
            return nodeOrEdge.ports();
        }

        if (nodeOrEdge instanceof ZxNode) {
            let n = nodeOrEdge;
            return this.activeEdgesOf(n).map(e => new ZxPort(e, n));
        }

        throw new Error(`Unrecognized: ${nodeOrEdge}`);
    }

    /**
     * @param {!ZxNode} n
     * @returns {!Array.<!ZxNode>}
     */
    activeNeighborsOf(n) {
        return this.activeEdgesOf(n).map(e => e.opposite(n));
    }

    /**
     * @param {!ZxNode} start
     * @param {!ZxNode} end
     * @returns {![!Array.<!ZxNode>, !Array.<!ZxEdge>]}
     * @private
     */
    static _line(start, end) {
        let dx = Math.sign(end.x - start.x);
        let dy = Math.sign(end.y - start.y);
        if (dx !== 0 && dy !== 0) {
            throw new Error('dx !== 0 && dy !== 0');
        }
        let horizontal = dx !== 0;
        let x = start.x;
        let y = start.y;
        let nodes = [];
        let edges = [];
        while (true) {
            nodes.push(new ZxNode(x, y));
            if (x === end.x && y === end.y) {
                break;
            }
            edges.push(ZxEdge.makeUnit(
                x + Math.min(dx, 0),
                y + Math.min(dy, 0),
                horizontal));
            x += dx;
            y += dy;
        }
        return [nodes, edges];
    }

    /**
     * @param {!ZxNode} start
     * @param {!ZxNode} end
     * @param {!Array.<!string>|undefined=undefined} node_types
     */
    add_line(start, end, node_types=undefined) {
        let [nodes, edges] = ZxGraph._line(start, end);
        if (node_types !== undefined) {
            if (nodes.length !== node_types.length) {
                throw new Error('nodes.length !== node_types.length');
            }
            for (let i = 0; i < nodes.length; i++) {
                let n = nodes[i];
                let t = node_types[i];
                if (this.nodes.get(n, t) !== t) {
                    throw new Error('this.nodes.get(n, t) !== t');
                }
                this.nodes.set(n, t);
            }
        }
        for (let e of edges) {
            if (this.edges.get(e, '-') !== '-') {
                throw new Error(`this.edges.get(e, '-') !== '-'`);
            }
            this.edges.set(e, '-');
        }
    }

    /**
     * @param {object|!ZxGraph} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof ZxGraph && other.edges.isEqualTo(this.edges) && other.nodes.isEqualTo(this.nodes);
    }

    /**
     * @returns {!{x: !int, y: !int, w: !int, h: !int}}
     */
    boundingBox() {
        let nodes = [...this.nodes.keys()];
        if (nodes.length === 0) {
            return {x: 0, y: 0, w: 0, h: 0};
        }
        let xs = nodes.map(n => n.x);
        let ys = nodes.map(n => n.y);
        let x = Math.min(...xs);
        let y = Math.min(...ys);
        return {
            x,
            y,
            w: Math.max(...xs) - x + 1,
            h: Math.max(...ys) - y + 1
        }
    }

    /**
     * @param {!int} dx
     * @param {!int} dy
     * @returns {!ZxGraph}
     */
    shifted(dx, dy) {
        /**
         * @param {!ZxNode} n
         * @returns {!ZxNode}
         */
        function shiftedNode(n) {
            return new ZxNode(n.x + dx, n.y + dy);
        }

        return new ZxGraph(
            this.nodes.mapKeys(shiftedNode),
            this.edges.mapKeys(e => new ZxEdge(shiftedNode(e.n1), shiftedNode(e.n2))))
    }

    /**
     * Produces a text diagram of the graph.
     * @param {!boolean} topLeftAsOrigin
     * @returns {!string}
     */
    toString(topLeftAsOrigin=false) {
        if (topLeftAsOrigin) {
            let {x, y} = this.boundingBox();
            return this.shifted(-x, -y).toString();
        }

        let xs = this.sortedNodes().map(n => n.x);
        let ys = this.sortedNodes().map(n => n.y);
        let w = Math.max(...xs) + 1;
        let h = Math.max(...ys) + 1;

        let lines = [];
        let node_reps = {
            '': ' ',
        };
        for (let node of NODES.all) {
            node_reps[node.id] = node.diagramReps[0];
        }
        let horizontalEdgeReps = {};
        let verticalEdgeReps = {
            '': ' ',
            '-': '|',
        };
        for (let node of NODES.all) {
            if (node.allowedDegrees.indexOf(2) !== -1) {
                horizontalEdgeReps[node.id] = node.diagramReps[0];
                verticalEdgeReps[node.id] = node.diagramReps[0];
            }
        }

        for (let row = 0; row < h; row++) {
            if (row > 0) {
                let vertical_modifiers = [];
                let vertical_connectors = [];
                for (let col = 0; col < w; col++) {
                    if (col > 0) {
                        vertical_connectors.push('   ');
                        vertical_modifiers.push('   ');
                    }
                    let e = new ZxNode(col, row).upUnitEdge();
                    let c = this.edges.get(e) || '';
                    vertical_connectors.push(c === '' ? ' ' : '|');
                    vertical_modifiers.push(verticalEdgeReps[c] || c);
                }

                lines.push(vertical_connectors.join(''));
                lines.push(vertical_modifiers.join(''));
                lines.push(vertical_connectors.join(''));
            }
            let chars = [];
            let cut = 0;
            for (let col = 0; col < w; col++) {
                let p = new ZxNode(col, row);

                if (col > 0) {
                    let c = this.edges.get(p.leftUnitEdge());
                    if (c === undefined) {
                        chars.push('   '.slice(cut));
                    } else {
                        chars.push(`-${horizontalEdgeReps[c] || c}-`.slice(cut));
                    }

                }
                let c = this.nodes.get(p) || '';
                if (c === '+') {
                    // Specialized crossing characters.
                    if (this.activeEdgesOf(p).length === 2) {
                        if (this.has(p.upUnitEdge()) && this.has(p.downUnitEdge())) {
                            chars.push('|');
                            continue;
                        }
                        if (this.has(p.leftUnitEdge()) && this.has(p.rightUnitEdge())) {
                            chars.push('-');
                            continue;
                        }
                    }
                }
                let nodeShown = node_reps[c] || c;
                chars.push(nodeShown);
                cut = nodeShown.length - 1;
            }
            lines.push(chars.join(''));
        }
        return lines.map(rtrim).join('\n');
    }

    /**
     * @param {!ZxEdge|!ZxNode} element
     * @param {!ZxEdge|!ZxNode} pivot
     * @returns {undefined|!ZxEdge|!ZxNode}
     */
    unblockedOppositeOfAcross(element, pivot) {
        if (pivot instanceof ZxEdge) {
            if (!(element instanceof ZxNode)) {
                throw new Error(`Pivot/element not opposite types: ${element}, ${pivot}`);
            }
            return pivot.opposite(element);
        } else if (pivot instanceof ZxNode) {
            if (!(element instanceof ZxEdge)) {
                throw new Error(`Pivot/element not opposite types: ${element}, ${pivot}`);
            }

            for (let pair of this.activeCrossingPortPairs(pivot)) {
                for (let i = 0; i < 2; i++) {
                    if (element.isEqualTo(pair[i].edge)) {
                        return pair[1-i].edge;
                    }
                }
            }

            return undefined;
        } else {
            throw new Error(`Unrecognized pivot type: ${pivot}`);
        }
    }

    /**
     * @param {!ZxEdge|!ZxNode} element
     * @param {!boolean=true} skipAmbiguous
     * @returns {!GeneralSet.<!ZxEdge>}
     */
    extendedUnblockedPath(element, skipAmbiguous=true) {
        if (!this.has(element)) {
            throw new Error(`Element is not in the graph and so cannot be part of an unblocked path: ${element}`);
        }

        let result = new GeneralSet();
        let queue = [];

        if (element instanceof ZxNode) {
            if (this.kind(element) !== '+') {
                return result;
            }
            let pairs = this.activeCrossingPortPairs(element);
            if (pairs.length !== 1 && skipAmbiguous) {
                return result;
            }
            for (let pair of pairs) {
                queue.push(...pair)
            }
        } else {
            result.add(element);
            queue.push(...element.ports())
        }

        while (queue.length > 0) {
            let curPort = queue.shift();
            let nextEdge = this.unblockedOppositeOfAcross(curPort.edge, curPort.node);
            if (nextEdge === undefined || result.has(nextEdge)) {
                continue;
            }
            result.add(nextEdge);
            let nextNode = nextEdge.opposite(curPort.node);
            queue.push(new ZxPort(nextEdge, nextNode));
        }
        return result;
    }
}

/**
 * @param {!Node} node
 * @returns {boolean|*}
 * @private
 */
function _contractConvertedNode(node) {
    let [e1, e2] = node.edges;

    // Cancel adjacent hadamards.
    let hadamardIdentities = ['O', '@', 'h', '-'];
    let kinds = [node.data.kind, e1.data.kind, e2.data.kind];
    if (kinds.every(kind => hadamardIdentities.indexOf(kind) !== -1)) {
        let parity = kinds.filter(e => e === 'h').length % 2;
        return {source: [node.data.source, e1.data.source, e2.data.source], kind: parity ? 'h' : '@'};
    }

    // Remove binary spider nodes with no phase and an empty edge.
    if (['O', '@'].indexOf(node.data.kind) !== -1) {
        if (e1.data.kind === '-') {
            return {source: [node.data.source, e1.data.source, e2.data.source], kind: e2.data.kind};
        }
        if (e2.data.kind === '-') {
            return {source: [node.data.source, e2.data.source, e1.data.source], kind: e1.data.kind};
        }
    }

    return false;
}

/**
 * @param {!Edge} edge
 * @returns {boolean|*}
 * @private
 */
function _contractConvertedEdge(edge) {
    if (edge.data.kind !== '-') {
        return false;
    }

    // Remove self-loops.
    if (edge.node1 === edge.node2) {
        return edge.node1.data;
    }

    let white = ['O', 'w', 'x', 'f'];
    let black = ['@', 's', 'z', 'a'];
    for (let color of [white, black]) {
        let k1 = color.indexOf(edge.node1.data.kind);
        let k2 = color.indexOf(edge.node2.data.kind);
        if (k1 !== -1 && k2 !== -1) {
            return {
                source: [edge.data.source, edge.node1.data.source, edge.node2.data.source],
                kind: color[(k1 + k2) % 4]
            };
        }
    }

    return false;
}

/**
 * @param {!Graph} graph
 */
function optimizeConvertedAdjGraph(graph) {
    graph = graph.copy();
    graph.contract(
        _contractConvertedEdge,
        _contractConvertedEdge,
        _contractConvertedNode,
        _contractConvertedNode);
    return graph;
}

/**
 * @param {!Graph} graph
 * @returns {!Graph}
 */
function edgeActionsToNodesAdjGraph(graph) {
    graph = graph.copy();
    for (let edge of graph.edges) {
        if (edge.data.kind !== '-') {
            let c = graph.addNode({source: edge.data.source, kind: edge.data.kind});
            edge.del();
            edge.node1.addEdgeTo(c, {source: edge.data.source, kind: '-'});
            c.addEdgeTo(edge.node2, {source: edge.data.source, kind: '-'});
        }
    }
    return graph;
}

function rtrim(e) {
    return e.replace(/ +$/g, '');
}

export {ZxNode, ZxEdge, ZxPort, ZxGraph, optimizeConvertedAdjGraph, edgeActionsToNodesAdjGraph}
