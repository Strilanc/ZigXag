import {GeneralMap} from "src/base/GeneralMap.js";


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
     * @returns {!Array.<!ZxEdgePortPos>}
     */
    ports() {
        return this.adjacent_edge_positions().map(e => new ZxEdgePortPos(e, this));
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
     * @returns {!Array.<!ZxEdgePortPos>}
     */
    ports() {
        return this.adjacent_node_positions().map(n => new ZxEdgePortPos(this, n));
    }

    /**
     * @param {!ZxNodePos} node
     * @returns {!ZxNodePos}
     */
    opposite(node) {
        let nodes = this.adjacent_node_positions();
        if (node === nodes[0]) {
            return nodes[1];
        }
        if (node === nodes[1]) {
            return nodes[0];
        }
        throw new Error(`${node} is not an endpoint of ${self}`);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `EdgePos(${this.n_x}, ${this.n_y}, ${this.horizontal})`;
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


class ZxEdgePortPos {
    /**
     * @param {!ZxEdgePos} edge
     * @param {!ZxNodePos} node
     */
    constructor(edge, node) {
        this.edge = edge;
        this.node = node;
    }

    /**
     * @param {object|!ZxEdgePortPos} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxEdgePortPos)) {
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
    constructor() {
        this.nodes = /** @type {!GeneralMap.<!ZxNodePos, !string>} */ new GeneralMap();
        this.edges = /** @type {!GeneralMap.<!ZxEdgePos, !string>} */ new GeneralMap();
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
     * @returns {!Array.<!ZxEdgePortPos>}
     */
    ports_of(nodeOrEdge) {
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
     * @returns {!string}
     */
    toString() {
        let xs = [...this.nodes.keys()].map(n => n.x);
        let ys = [...this.nodes.keys()].map(n => n.y);
        let w = Math.max(...xs) + 1;
        let h = Math.max(...ys) + 1;

        let lines = [];
        let node_reps = {
            '': '.',
            '@': '@',
            'O': 'O',
            'in': '!',
            'out': '?',
        };
        let horizontal_edge_reps = {
            '': '   ',
            '-': '---',
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
                    let c = this.edges.get(p.left_edge_position()) || '';
                    chars.push(horizontal_edge_reps[c] || c);
                }
                let c = this.nodes.get(p) || '';
                chars.push(node_reps[c] || c);
            }
            lines.push(chars.join(''));
        }
        function rtrim(e) {
            return e.replace(/ +$/g, '');
        }
        return lines.map(rtrim).join('\n')
    }
}

export {ZxNodePos, ZxEdgePos, ZxEdgePortPos, ZxGraph}
