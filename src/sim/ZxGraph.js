import {GeneralMap} from "src/base/GeneralMap.js";
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
    adjacent_edge_positions() {
        return [
            this.right_edge_position(),
            this.up_edge_position(),
            this.left_edge_position(),
            this.down_edge_position(),
        ];
    }

    /**
     * @returns {!Array.<!ZxPort>}
     */
    ports() {
        return this.adjacent_edge_positions().map(e => new ZxPort(e, this));
    }

    /**
     * @returns {!ZxEdge}
     */
    right_edge_position() {
        return ZxEdge.makeHorizontalUnit(this.x, this.y);
    }

    /**
     * @returns {!ZxEdge}
     */
    down_edge_position() {
        return ZxEdge.makeVerticalUnit(this.x, this.y);
    }

    /**
     * @returns {!ZxEdge}
     */
    left_edge_position() {
        return ZxEdge.makeHorizontalUnit(this.x - 1, this.y);
    }

    /**
     * @returns {!ZxEdge}
     */
    up_edge_position() {
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
     * @returns {!boolean}
     */
    isHorizontal() {
        return this.n1.y === this.n2.y;
    }

    /**
     * @returns {!boolean}
     */
    isVertical() {
        return this.n1.x === this.n2.x;
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
            return `${e.n1.x},${e.n1.y},${e.isHorizontal() ? 'h' : 'v'},${this.kind(e)}`;
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
            let [x, y, h, k] = t.split(',');
            let e = ZxEdge.makeUnit(parseInt(x), parseInt(y), h === 'h');
            result.edges.set(e, k);
        }

        let [nodeText, edgeText] = text.split(':');
        nodeText.split(';').map(parseNode);
        edgeText.split(';').map(parseEdge);

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

        // Consistency checks.
        if (lines.length % 4 !== 1) {
            throw new Error('Misaligned diagram. Number of non-empty lines must equal 1 mod 4.');
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
            if (edge.isHorizontal()) {
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
        };

        // Nodes.
        for (let row = 0; row < lines.length; row += 4) {
            let line = lines[row];
            for (let col = 0; col < line.length; col += 4) {
                let c = line[col];
                let n = new ZxNode(col >> 2, row >> 2);
                if (c === ' ') {
                    for (let e of n.adjacent_edge_positions()) {
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
     * @param {!ZxNode} n
     * @returns {!Array.<!ZxEdge>}
     */
    edges_of(n) {
        if (!this.nodes.has(n)) {
            return [];
        }
        return n.adjacent_edge_positions().filter(e => this.edges.has(e));
    }

    /**
     * @param {!ZxNode|!ZxEdge} nodeOrEdge
     * @returns {!Array.<!ZxPort>}
     */
    activePortsOf(nodeOrEdge) {
        return nodeOrEdge.ports().filter(p => this.edges.has(p.edge) && this.nodes.has(p.node));
    }

    /**
     * @param {!ZxNode} n
     * @returns {!Array.<!ZxNode>}
     */
    neighbors_of(n) {
        return this.edges_of(n).map(e => e.opposite(n));
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
     * Produces a text diagram of the graph.
     * @returns {!string}
     */
    toString() {
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
                    let e = new ZxNode(col, row).up_edge_position();
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
                    let c = this.edges.get(p.left_edge_position());
                    if (c === undefined) {
                        chars.push('   ');
                    } else {
                        chars.push('-' + (horizontal_edge_reps[c] || c) + '-');
                    }

                }
                let c = this.nodes.get(p) || '';
                chars.push(node_reps[c] || c);
            }
            lines.push(chars.join(''));
        }
        return lines.map(rtrim).join('\n')
    }
}

function rtrim(e) {
    return e.replace(/ +$/g, '');
}

export {ZxNode, ZxEdge, ZxPort, ZxGraph}
