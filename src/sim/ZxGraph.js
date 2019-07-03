import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {Seq, seq} from "src/base/Seq.js";


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
     * @returns {!ZxPort}
     */
    opposite() {
        return new ZxPort(this.edge, this.edge.opposite(this.node));
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
     * @returns {!Array.<!ZxNode>}
     */
    outputNodes() {
        let result = [];
        for (let node of this.sortedNodes()) {
            let kind = this.nodes.get(node);
            if (kind === 'out') {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * @returns {!Array.<!{node: !ZxNode, axis: !boolean}>}
     */
    spiderMeasurementNodes() {
        let result = [];
        for (let node of this.sortedNodes()) {
            let kind = this.nodes.get(node);
            if (kind === 'O') {
                result.push({node, axis: true});
            } else if (kind === '@') {
                result.push({node, axis: false});
            }
        }
        return result;
    }

    /**
     * @returns {!Array.<!ZxNode>}
     */
    crossingNodes() {
        let result = [];
        for (let node of this.sortedNodes()) {
            let kind = this.nodes.get(node);
            if (kind === '+') {
                result.push(node);
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
        for (let {node} of this.spiderMeasurementNodes()) {
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
            if (line !== '' && line.length % 4 !== 1) {
                throw new Error(`Misaligned diagram. Length must equal 1 mod 4: "${line}".`);
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
                    throw new Error(`Must use dash for h edge at row=${row} col=${col}.`);
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

        let edgeKindMap = {
            '-': '-',
            '|': '-',
            'x': 'x',
            'X': 'x',
            'z': 'z',
            'Z': 'z',
            'f': 'f',
            'F': 'f',
            's': 's',
            'S': 's',
            'h': 'h',
            'H': 'h',
        };
        let nodeKindMap = {
            '@': '@',
            'O': 'O',
            '!': 'in',
            '?': 'out',
            '+': '+',
            '-': '+',
            '|': '+',
        };

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
            '@': '@',
            'O': 'O',
            'in': '!',
            'out': '?',
        };
        let horizontal_edge_reps = {
        };
        let vertical_edge_reps_out = {
            '': ' ',
            '-': '|',
        };
        let vertical_edge_reps_in = {
            '': ' ',
            '-': '|',
        };

        for (let row = 0; row < h; row++) {
            if (row > 0) {
                let in_chars = [];
                let out_chars = [];
                for (let col = 0; col < w; col++) {
                    if (col > 0) {
                        out_chars.push('   ');
                        in_chars.push('   ');
                    }
                    let e = new ZxNode(col, row).upUnitEdge();
                    let c = this.edges.get(e) || '';
                    out_chars.push(vertical_edge_reps_out[c] || c);
                    in_chars.push(vertical_edge_reps_in[c] || c);
                }

                lines.push(out_chars.join(''));
                lines.push(in_chars.join(''));
                lines.push(out_chars.join(''));
            }
            let chars = [];
            for (let col = 0; col < w; col++) {
                let p = new ZxNode(col, row);

                if (col > 0) {
                    let c = this.edges.get(p.leftUnitEdge());
                    if (c === undefined) {
                        chars.push('   ');
                    } else {
                        chars.push('-' + (horizontal_edge_reps[c] || c) + '-');
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
                chars.push(node_reps[c] || c);
            }
            lines.push(chars.join(''));
        }
        return lines.map(rtrim).join('\n')
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

function rtrim(e) {
    return e.replace(/ +$/g, '');
}

export {ZxNode, ZxEdge, ZxPort, ZxGraph}
