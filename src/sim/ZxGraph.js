import {GeneralMap} from "src/base/GeneralMap.js";
import {Seq, seq} from "src/base/Seq.js";


class ZxNodePos {
    /**
     * @param {!int} x
     * @param {!int} y
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * @returns {!Array.<!ZxEdgePos>}
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
     * @returns {!ZxEdgePos}
     */
    right_edge_position() {
        return new ZxEdgePos(this.x, this.y, true);
    }

    /**
     * @returns {!ZxEdgePos}
     */
    down_edge_position() {
        return new ZxEdgePos(this.x, this.y, false);
    }

    /**
     * @returns {!ZxEdgePos}
     */
    left_edge_position() {
        return new ZxEdgePos(this.x - 1, this.y, true);
    }

    /**
     * @returns {!ZxEdgePos}
     */
    up_edge_position() {
        return new ZxEdgePos(this.x, this.y - 1, false);
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
        return this.x + this.y * 10000.1;
    }

    /**
     * @param {object|!ZxNodePos} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxNodePos)) {
            return false;
        }
        return this.x === other.x && this.y === other.y;
    }
}


class ZxEdgePos {
    /**
     * @param {!int} n_x
     * @param {!int} n_y
     * @param {!boolean} horizontal
     */
    constructor(n_x, n_y, horizontal) {
        this.n_x = n_x;
        this.n_y = n_y;
        this.horizontal = horizontal;
    }

    /**
     * @returns {!Array.<!ZxNodePos>}
     */
    adjacent_node_positions() {
        let dx = this.horizontal ? 1 : 0;
        let dy = 1 - dx;
        return [
            new ZxNodePos(this.n_x, this.n_y),
            new ZxNodePos(this.n_x + dx, this.n_y + dy),
        ];
    }

    /**
     * @returns {!Array.<!ZxPort>}
     */
    ports() {
        return this.adjacent_node_positions().map(n => new ZxPort(this, n));
    }

    /**
     * @param {!ZxNodePos} node
     * @returns {!ZxNodePos}
     */
    opposite(node) {
        let nodes = this.adjacent_node_positions();
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
        return this.n_x + this.n_y * 10000.1 + (this.horizontal ? 0.5 : 0);
    }

    /**
     * @returns {!number}
     */
    orderValXThenY() {
        return this.n_x * 10000.1 + this.n_y + (this.horizontal ? 0.5 : 0);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `(${this.n_x},${this.n_y},${this.horizontal ? '>' : 'V'})`;
    }

    /**
     * @param {object|!ZxEdgePos} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxEdgePos)) {
            return false;
        }
        return this.n_x === other.n_x && this.n_y === other.n_y && this.horizontal === other.horizontal;
    }
}


/**
 * The location where an edge is entering into a node. An adjacent edge/node combination.
 */
class ZxPort {
    /**
     * @param {!ZxEdgePos} edge
     * @param {!ZxNodePos} node
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
     * @param {!GeneralMap.<!ZxNodePos, !string>=} nodes
     * @param {!GeneralMap.<!ZxEdgePos, !string>=} edges
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
     * @param {!ZxNodePos|!ZxEdgePos} nodeOrEdge
     * @returns {!boolean}
     */
    has(nodeOrEdge) {
        let map = (nodeOrEdge instanceof ZxNodePos) ? this.nodes : this.edges;
        return map.has(nodeOrEdge);
    }

    /**
     * @param {!ZxNodePos|!ZxEdgePos} nodeOrEdge
     * @returns {undefined|!string}
     */
    kind(nodeOrEdge) {
        let map = (nodeOrEdge instanceof ZxNodePos) ? this.nodes : this.edges;
        return map.get(nodeOrEdge);
    }

    /**
     * @returns {!string}
     */
    serialize() {
        let nodes = this.sortedNodes();
        let edges = this.sortedEdges();
        let nodeText = nodes.map(n => `${n.x},${n.y},${this.nodes.get(n)}`).join(';');
        let edgeText = edges.map(e => `${e.n_x},${e.n_y},${e.horizontal ? 'h' : 'v'},${this.edges.get(e)}`).join(';');
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
            let n = new ZxNodePos(parseInt(x), parseInt(y));
            result.nodes.set(n, k);
        }

        function parseEdge(t) {
            let [x, y, h, k] = t.split(',');
            let e = new ZxEdgePos(parseInt(x), parseInt(y), h === 'h');
            result.edges.set(e, k);
        }

        let [nodeText, edgeText] = text.split(':');
        nodeText.split(';').map(parseNode);
        edgeText.split(';').map(parseEdge);

        return result;
    }

    /**
     * @returns {!Array.<!ZxNodePos>}
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
     * @returns {!Array.<!ZxNodePos>}
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
     * @returns {!Array.<!{node: !ZxNodePos, axis: !boolean}>}
     */
    toricMeasurementNodes() {
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
     * @returns {!Array.<!ZxNodePos>}
     */
    sortedNodes() {
        let nodes = [...this.nodes.keys()];
        nodes.sort((a, b) => a.orderVal() - b.orderVal());
        return nodes;
    }

    /**
     * Ordered top to bottom, then left to right.
     * @returns {!Array.<!ZxEdgePos>}
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

        function assertEdge(edge, present, desc) {
            let col = edge.n_x * 4;
            let row = edge.n_y * 4;
            let dxs = [0];
            let dys = [1, 2, 3];
            if (edge.horizontal) {
                [dxs, dys] = [dys, dxs];
            }
            for (let dy of dys) {
                let line = lines[row + dy] || '';
                for (let dx of dxs) {
                    let c = line[col + dx] || ' ';
                    if ((c !== ' ') !== present) {
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
                let n = new ZxNodePos(col >> 2, row >> 2);
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
                let e = new ZxEdgePos(col >> 2, row >> 2, false);
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
                let e = new ZxEdgePos(col >> 2, row >> 2, true);
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
     * @param {!ZxNodePos} n
     * @returns {!Array.<!ZxEdgePos>}
     */
    edges_of(n) {
        if (!this.nodes.has(n)) {
            return [];
        }
        return n.adjacent_edge_positions().filter(e => this.edges.has(e));
    }

    /**
     * @param {!ZxNodePos|!ZxEdgePos} nodeOrEdge
     * @returns {!Array.<!ZxPort>}
     */
    activePortsOf(nodeOrEdge) {
        return nodeOrEdge.ports().filter(p => this.edges.has(p.edge) && this.nodes.has(p.node));
    }

    /**
     * @param {!ZxNodePos} n
     * @returns {!Array.<!ZxNodePos>}
     */
    neighbors_of(n) {
        return this.edges_of(n).map(e => e.opposite(n));
    }

    /**
     * @param {!ZxNodePos} start
     * @param {!ZxNodePos} end
     * @returns {![!Array.<!ZxNodePos>, !Array.<!ZxEdgePos>]}
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
            nodes.push(new ZxNodePos(x, y));
            if (x === end.x && y === end.y) {
                break;
            }
            edges.push(new ZxEdgePos(
                x + Math.min(dx, 0),
                y + Math.min(dy, 0),
                horizontal));
            x += dx;
            y += dy;
        }
        return [nodes, edges];
    }

    /**
     * @param {!ZxNodePos} start
     * @param {!ZxNodePos} end
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
                    let e = new ZxNodePos(col, row).up_edge_position();
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
                let p = new ZxNodePos(col, row);

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

export {ZxNodePos, ZxEdgePos, ZxPort, ZxGraph}
