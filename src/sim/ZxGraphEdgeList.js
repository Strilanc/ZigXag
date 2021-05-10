import {Util} from "src/base/Util.js";
import {equate_Iterables} from "src/base/Equate.js";
import {describe} from "src/base/Describe.js";
import {stim} from "src/ext/stim.js";


/**
 * Each node in a ZX graph is annotated with metadata. This class stores that metadata.
 */
class ZxNodeAnnotation {
    /**
     * @param {!string} type A string identifying the type of node.
     *     - "Z": Z spider.
     *     - "X": X spider.
     *     - "H": Hadamard. Must have degree 2. Must have angle 0.
     *     - "in": Input into graph. Must have degree 1. Must have angle 0.
     *     - "out": Output from graph. Must have degree 1. Must have angle 0.
     * @param {!int} quarter_turns The angle of the node in units of pi/2. Automatically canonicalized into [0, 4).
     */
    constructor(type, quarter_turns = 0) {
        this.type = type;
        this.quarter_turns = Util.properMod(quarter_turns, 4);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `ZxNodeAnnotation(type="${this.type}", quarter_turns=${this.quarter_turns})`;
    }

    /**
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof ZxNodeAnnotation && this.type === other.type && this.quarter_turns === other.quarter_turns;
    }
}

/**
 * A ZX graph represented as an edge list between node indices.
 */
class ZxGraphEdgeList {
    /**
     * @param {!Array.<!ZxNodeAnnotation>} nodes Annotations for each node.
     * @param {!Array.<[!int, !int]>} edges Unsorted list of node index pairs.
     */
    constructor(nodes, edges) {
        for (let n of nodes) {
            if (!(n instanceof ZxNodeAnnotation)) {
                throw new Error("!(n instanceof ZxNodeAnnotation)");
            }
        }
        for (let [a, b] of edges) {
            if (a < 0 || a >= nodes.length || b < 0 || b >= nodes.length) {
                throw new Error(`Edge [${a}, ${b}] has a node index outside [0, nodes.length=${nodes.length}).`);
            }
        }
        this.nodes = nodes;
        this.edges = edges;
    }

    /**
     * @returns {Map<!int, !Array.<!int>>}
     */
    neighborMap() {
        let result = new Map();
        for (let k = 0; k < this.nodes.length; k++) {
            result.set(k, []);
        }
        for (let [a, b] of this.edges) {
            result.get(a).push(b);
            result.get(b).push(a);
        }
        return result;
    }

    /**
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxGraphEdgeList)) {
            return false;
        }
        return equate_Iterables(this.nodes, other.nodes) && equate_Iterables(this.edges, other.edges);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `new SimpleZxGraph(${describe(this.nodes)}], ${describe(this.edges)})`;
    }

    /**
     * @param {!string} text
     * @returns {!ZxGraphEdgeList}
     */
    static from_text_diagram(text) {
        let char_map = _text_to_char_map(text);
        let {node_ids, nodes} = _find_nodes(char_map);
        let edges = _find_all_edges(char_map, node_ids);
        return new ZxGraphEdgeList(nodes, edges);
    }

    /**
     * @returns {!Array.<!stim_PauliString>}
     */
    stabilizers() {
        let sim = new stim.TableauSimulator().deleteLater();
        let neighbor_map = this.neighborMap();

        // Interpret each edge as a cup producing an EPR pair.
        // - The qubits of the EPR pair fly away from the center of the edge, towards their respective nodes.
        // - The qubit keyed by (a, b) is the qubit heading towards b from the edge between a and b.
        let qubit_ids = new Map();
        for (let [a, b] of this.edges) {
            if (a === b) {
                // Ignore self-edges. In a well formed non-zero graph they have no effect.
                continue;
            }
            qubit_ids.set(`${a},${b}`, qubit_ids.size);
            qubit_ids.set(`${b},${a}`, qubit_ids.size);
            sim.H(qubit_ids.get(`${a},${b}`));
            sim.CNOT(qubit_ids.get(`${a},${b}`), qubit_ids.get(`${b},${a}`));
        }

        // Interpret each internal node as a family of post-selected parity measurements.
        for (let n1 = 0; n1 < this.nodes.length; n1++) {
            let {type, quarter_turns} = this.nodes[n1];
            let neighbors = neighbor_map.get(n1)

            if (type !== 'Z' && type !== 'X' && quarter_turns !== 0) {
                throw new Error(`${type} node must have quarter_turns==0 but had quarter_turns ${quarter_turns}.`);
            }
            if (type === 'Z') {
                // Handled below.
            } else if (type === 'X') {
                // Surround X type node with Hadamards so it can be handled below as if it were Z type.
                for (let n2 of neighbors) {
                    if (n2 !== n1) {
                        sim.H(qubit_ids.get(`${n2},${n1}`));
                    }
                }
            } else if (type === 'H') {
                // Hadamard one input so the H node can be handled as if it were Z type.
                if (neighbors.length !== 2) {
                    throw new Error(`"${type}" node must have degree 2 but had degree ${neighbors.length}.`);
                }
                let n2 = neighbors[0];
                sim.H(qubit_ids.get(`${n2},${n1}`));
            } else if (type === 'out' || type === 'in') {
                if (neighbors.length !== 1) {
                    throw new Error(`"${type}" node must have degree 1 but had degree ${neighbors.length}.`);
                }
                continue  // Don't measure qubits leaving the system.
            } else {
                throw new Error(`Unsupported node type "${type}".`);
            }

            // Handle Z type node.
            // - Postselects the ZZ observable over each pair of incoming qubits.
            // - Postselects the (S**quarter_turns X S**-quarter_turns)XX..X observable over all incoming qubits.
            neighbors = neighbors.filter(n2 => n2 !== n1);
            let top_neighbor = neighbors.pop();
            let center = qubit_ids.get(`${top_neighbor},${n1}`)  // Pick one incoming qubit to be the common control for the others.
            // Handle node angle using a phasing operation.
            if (quarter_turns === 1) {
                sim.S(center);
            } else if (quarter_turns === 2) {
                sim.Z(center);
            } else if (quarter_turns === 3) {
                sim.S_DAG(center);
            }
            // Use multi-target CNOT and Hadamard to transform postselected observables into single-qubit Z observables.
            for (let n2 of neighbors) {
                sim.CNOT(center, qubit_ids.get(`${n2},${n1}`));
            }
            sim.H(center)
            // Postselect the observables.
            neighbors.push(top_neighbor);
            for (let n2 of neighbors) {
                pseudo_postselect(sim, qubit_ids.get(`${n2},${n1}`));
            }
        }

        // Find output qubits.
        let ext = [];
        for (let k = 0; k < this.nodes.length; k++) {
            if (this.nodes[k].type === 'in') {
                ext.push(k);
            }
        }
        for (let k = 0; k < this.nodes.length; k++) {
            if (this.nodes[k].type === 'out') {
                ext.push(k);
            }
        }
        let out_qubits = [];
        for (let n_out of ext) {
            let [neighbor] = neighbor_map.get(n_out);
            out_qubits.push(qubit_ids.get(`${neighbor},${n_out}`));
        }

        // Remove qubits corresponding to non-external edges.
        for (let i = 0; i < out_qubits.length; i++) {
            sim.SWAP(out_qubits[i], qubit_ids.size + i);
        }
        for (let i = 0; i < out_qubits.length; i++) {
            sim.SWAP(i, qubit_ids.size + i);
        }
        sim.set_num_qubits(out_qubits.length)

        // Stabilizers of the simulator state are the external stabilizers of the graph.
        return sim.canonical_stabilizers();
    }
}

/**
 * Pretend to postselect by using classical feedback to consistently get into the measurement-was-false state.
 * @param {!stim_TableauSimulator} sim
 * @param {!int} target
 */
function pseudo_postselect(sim, target) {
    let {result, kickback} = sim.measure_kickback(target);
    if (kickback !== undefined) {
        kickback.deleteLater();
        let m = stim.target_rec(-1);
        for (let q = 0; q < kickback.length; q++) {
            let p = kickback.pauli(q);
            if (p === 1) {
                sim.CNOT(m, q);
            } else if (p === 2) {
                sim.CY(m, q);
            } else if (p === 3) {
                sim.CZ(m, q);
            }
        }
    } else if (result) {
        throw new Error("Impossible postselection. Graph contained a contradiction.");
    }
}

/**
 * @param {!string} text
 * @returns {!Map<!string, ![!int, !int, !string]>}
 * @private
 */
function _text_to_char_map(text) {
    let char_map = new Map();
    let x = 0;
    let y = 0;
    for (let c of text) {
        if (c === '\n') {
            x = 0;
            y++;
            continue;
        }
        if (c !== ' ') {
            char_map.set(`${x},${y}`, [x, y, c]);
        }
        x++;
    }
    return char_map;
}

const DIR_TO_CHARS = new Map([
    ['-1,-1', '\\'],
    ['0,-1', '|+'],
    ['1,-1', '/'],
    ['-1,0', '-+'],
    ['1,0', '-+'],
    ['-1,1', '/'],
    ['0,1', '|+'],
    ['1,1', '\\'],
]);
const CHAR_TO_DIR = new Map([
    ['\\', [1, 1]],
    ['-', [1, 0]],
    ['|', [0, 1]],
    ['/', [-1, 1]],
]);
const NAMED_NODES = new Map([
    ['X', new ZxNodeAnnotation('X')],
    ['X(pi)', new ZxNodeAnnotation('X', 2)],
    ['X(pi/2)', new ZxNodeAnnotation('X', 1)],
    ['X(-pi/2)', new ZxNodeAnnotation('X', -1)],
    ['Z', new ZxNodeAnnotation('Z')],
    ['Z(pi)', new ZxNodeAnnotation('Z', 2)],
    ['Z(pi/2)', new ZxNodeAnnotation('Z', 1)],
    ['Z(-pi/2)', new ZxNodeAnnotation('Z', -1)],
    ['H', new ZxNodeAnnotation('H')],
    ['in', new ZxNodeAnnotation('in')],
    ['out', new ZxNodeAnnotation('out')],
])

/**
 * @param {!Map<!string, ![!int, !int, !string]>} char_map
 * @param {!Map<!string, K>} terminal_map
 * @returns {!Array.<![K, K]>}
 * @template K
 * @private
 */
function _find_all_edges(char_map, terminal_map) {
    let edges = [];
    let already_travelled = new Set();
    for (let [k, [x, y, c]] of char_map.entries()) {
        if (terminal_map.has(k)) {
            continue;
        }
        if (already_travelled.has(k)) {
            continue;
        }
        if (c === '*') {
            continue;
        }
        let dxy = CHAR_TO_DIR.get(c);
        if (dxy === undefined) {
            throw new Error(`Character ${x+1} ('${c}') in line ${y+1} isn't part of a node or an edge`);
        }
        let [dx, dy] = dxy;
        already_travelled.add(k)
        let n1 = _find_end_of_edge(x + dx, y + dy, dx, dy, char_map, terminal_map, already_travelled);
        let n2 = _find_end_of_edge(x - dx, y - dy, -dx, -dy, char_map, terminal_map, already_travelled);
        edges.push([n2, n1]);
    }
    return edges;
}

/**
 * @param {!int} x
 * @param {!int} y
 * @param {!int} dx
 * @param {!int} dy
 * @param {!Map<!string, ![!int, !int, !string]>} char_map
 * @param {!Map<!string, K>} terminal_map
 * @param {!Set<!string>} already_travelled
 * @returns {K}
 * @template K
 * @private
 */
function _find_end_of_edge(x, y, dx, dy, char_map, terminal_map, already_travelled) {
    while (true) {
        let k = `${x},${y}`;
        let c = char_map.get(k)[2];
        if (terminal_map.has(k)) {
            return terminal_map.get(k);
        }

        if (c !== '+') {
            if (already_travelled.has(k)) {
                throw new Error(`Edge used twice.`);
            }
            already_travelled.add(k);
        }

        let next_deltas = [];
        if (c === '*') {
            for (let dx2 = -1; dx2 <= 1; dx2++) {
                for (let dy2 = -1; dy2 <= 1; dy2++) {
                    let cxy2 = char_map.get(`${x + dx2},${y + dy2}`);
                    let c2 = cxy2 === undefined ? undefined : cxy2[2];
                    if ((dx2 !== 0 || dy2 !== 0) && (dx2 !== -dx || dy2 !== -dy) && DIR_TO_CHARS.get(`${dx2},${dy2}`).indexOf(c2) !== -1) {
                        next_deltas.push([dx2, dy2]);
                    }
                }
            }
            if (next_deltas.length !== 1) {
                throw new Error(`Edge junction ('*') at character ${x+1}$ of line ${y+1} doesn't have exactly 2 legs.`);
            }
            [[dx, dy]] = next_deltas;
        } else {
            let expected = DIR_TO_CHARS.get(`${dx},${dy}`);
            if (expected.indexOf(c) === -1) {
                throw new Error(`Dangling edge at character ${x+1}$ of line ${y+1} travelling dx=${dx},dy=${dy}.`);
            }
        }
        x += dx;
        y += dy;
    }
}

/**
 * @param {!Map.<!string, ![!int, !int, !string]>} char_map
 * @returns {!{node_ids: !Map.<!string, !int>, nodes: !Array.<!ZxNodeAnnotation>}}
 * @private
 */
function _find_nodes(char_map) {
    let node_ids = new Map();
    let nodes = [];

    const NODE_CHARS = /^[a-zA-Z0-9()]$/
    let next_node_id = 0;

    for (let [k, [x, y, lead_char]] of char_map.entries()) {
        if (node_ids.has(k)) {
            continue;
        }
        if (!NODE_CHARS.test(lead_char)) {
            continue;
        }

        let n = 0;
        let nested = 0;
        let full_name = '';
        while (true) {
            let xyc = char_map.get(`${x+n},${y}`);
            let c = xyc === undefined ? ' ' : xyc[2];
            if (c === ' ' && nested > 0) {
                throw new Error("Label ended before ')' to go with '(' was found.")
            }
            if (nested === 0 && !NODE_CHARS.test(c)) {
                break;
            }
            full_name += c;
            if (c === '(') {
                nested++;
            } else if (c === ')') {
                nested--;
            }
            n += 1;
        }

        let node = NAMED_NODES.get(full_name);
        if (node === undefined) {
            throw new Error(`Unrecognized node type: '${full_name}'`);
        }

        let id = next_node_id;
        next_node_id++;
        for (let k = 0; k < n; k++) {
            node_ids.set(`${x+k},${y}`, id);
        }
        nodes.push(node);
    }

    return {node_ids, nodes};
}

export {ZxNodeAnnotation, ZxGraphEdgeList, _find_nodes, _find_end_of_edge, _find_all_edges, _text_to_char_map}
