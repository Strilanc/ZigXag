import {Util} from "src/base/Util.js";
import {equate_Iterables} from "src/base/Equate.js";
import {describe} from "src/base/Describe.js";
import {stim} from "src/ext/stim.js";


/**
 * Each node in a ZX graph is annotated with metadata. This class stores that metadata.
 */
class ZxType {
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
        return `ZxType("${this.type}", quarter_turns=${this.quarter_turns})`;
    }

    /**
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof ZxType && this.type === other.type && this.quarter_turns === other.quarter_turns;
    }
}

class ExternalStabilizer {
    /**
     * @param {!string} input
     * @param {!string} output
     * @param {!int} sign
     */
    constructor(input, output, sign) {
        this.input = input;
        this.output = output;
        this.sign = sign;
    }

    /**
     * @param {!stim_PauliString} stabilizer
     * @param {!int} num_inputs
     * @returns {!ExternalStabilizer}
     */
    static from_dual(stabilizer, num_inputs) {
        let s = stabilizer.toString();
        let inp = s.substr(1, num_inputs);
        let out = s.substr(num_inputs + 1);
        let sign = +(s.substr(0, 1) + '1');
        for (let c of inp) {
            if (c === 'Y') {
                sign *= -1;
            }
        }
        return new ExternalStabilizer(inp, out, sign);
    }

    /**
     * @param {!int} num_inputs
     * @param {!Array.<stim_PauliString>} dual_stabilizers
     * @returns {!Array.<ExternalStabilizer>}
     */
    static from_duals(num_inputs, dual_stabilizers) {
        if (dual_stabilizers.length === 0) {
            return [];
        }

        let num_qubits = dual_stabilizers[0].length;
        let num_outputs = num_qubits - num_inputs;

        // Pivot on output qubits, to potentially isolate input-only stabilizers.
        let min_pivot = 0;
        for (let q = num_inputs; q < num_qubits; q++) {
            min_pivot = stabilizer_elimination_step(dual_stabilizers, min_pivot, q);
        }

        // Separate input-only stabilizers from the rest.
        let input_only_stabilizers = [];
        let output_using_stabilizers = [];
        for (let dual of dual_stabilizers) {
            if (dual.toString().endsWith('_'.repeat(num_outputs))) {
                input_only_stabilizers.push(dual);
            } else {
                output_using_stabilizers.push(dual);
            }
        }

        // Canonicalize the output-using stabilizers.
        min_pivot = 0;
        for (let q = 0; q < num_qubits; q++) {
            min_pivot = stabilizer_elimination_step(output_using_stabilizers, min_pivot, q);
        }
        // Canonicalize the input-only stabilizers.
        min_pivot = 0;
        for (let q = 0; q < num_inputs; q++) {
            min_pivot = stabilizer_elimination_step(input_only_stabilizers, min_pivot, q);
        }

        dual_stabilizers = [...input_only_stabilizers, ...output_using_stabilizers];

        return dual_stabilizers.map(e => ExternalStabilizer.from_dual(e, num_inputs));
    }

    /**
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof ExternalStabilizer && this.output === other.output && this.input === other.input && this.sign === other.sign;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let s = this.sign === +1 ? '+' : this.sign === -1 ? '-' : '?';
        return `+${this.input} -> ${s}${this.output}`;
    }
}

/**
 * @param {!Array.<!stim_PauliString>} duals
 * @param {!int} min_pivot
 * @param {!int} qubit
 * @returns {!int}
 */
function stabilizer_elimination_step(duals, min_pivot, qubit) {
    for (let b = 1; b < 4; b += 2) {
        let pivot;
        for (pivot = min_pivot; pivot < duals.length; pivot++) {
            let p = duals[pivot].pauli(qubit);
            if (p === 2 || p === b) {
                break;
            }
        }
        if (pivot === duals.length) {
            continue;
        }
        for (let s = 0; s < duals.length; s++) {
            let p = duals[s].pauli(qubit);
            if (s !== pivot && (p === 2 || p === b)) {
                duals[s].times_inplace(duals[pivot]);
            }
        }
        if (min_pivot !== pivot) {
            let t = duals[min_pivot];
            duals[min_pivot] = duals[pivot];
            duals[pivot] = t;
        }
        min_pivot += 1;
    }
    return min_pivot;
}

/**
 * A ZX graph represented as an edge list between node indices.
 */
class ZxGraphEdgeList {
    /**
     * @param {!Array.<!ZxType>} nodes Annotations for each node.
     * @param {!Array.<[!int, !int]>} edges Unsorted list of node index pairs.
     */
    constructor(nodes, edges) {
        for (let n of nodes) {
            if (!(n instanceof ZxType)) {
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
     * @returns {!Array.<!ExternalStabilizer>}
     */
    external_stabilizers() {
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

        // Find external qubits.
        let inputs = [];
        let outputs = [];
        for (let k = 0; k < this.nodes.length; k++) {
            let t = this.nodes[k].type;
            if (t === 'in' || t === 'out') {
                let [neighbor] = neighbor_map.get(k);
                let q = qubit_ids.get(`${neighbor},${k}`)
                if (t === 'in') {
                    inputs.push(q);
                } else {
                    outputs.push(q);
                }
            }
        }
        let ext_qubits = [...inputs, ...outputs];
        sim.set_num_qubits(qubit_ids.size + ext_qubits.length)

        // Remove qubits corresponding to non-external edges.
        for (let i = 0; i < ext_qubits.length; i++) {
            sim.SWAP(ext_qubits[i], qubit_ids.size + i);
        }
        for (let i = 0; i < ext_qubits.length; i++) {
            sim.SWAP(i, qubit_ids.size + i);
        }
        sim.set_num_qubits(ext_qubits.length)

        // Stabilizers of the simulator state are the external stabilizers of the graph.
        let dual_stabilizers = sim.canonical_stabilizers();
        let result = ExternalStabilizer.from_duals(inputs.length, dual_stabilizers);
        for (let e of dual_stabilizers) {
            e.delete();
        }
        return result;
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
    ['X', new ZxType('X')],
    ['X(pi)', new ZxType('X', 2)],
    ['X(pi/2)', new ZxType('X', 1)],
    ['X(-pi/2)', new ZxType('X', -1)],
    ['Z', new ZxType('Z')],
    ['Z(pi)', new ZxType('Z', 2)],
    ['Z(pi/2)', new ZxType('Z', 1)],
    ['Z(-pi/2)', new ZxType('Z', -1)],
    ['H', new ZxType('H')],
    ['in', new ZxType('in')],
    ['out', new ZxType('out')],
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
        if (c === '*' || c === '+') {
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
 * @returns {!{node_ids: !Map.<!string, !int>, nodes: !Array.<!ZxType>}}
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

export {ZxType, ZxGraphEdgeList, ExternalStabilizer, _find_nodes, _find_end_of_edge, _find_all_edges, _text_to_char_map}
