import {Util} from "src/base/Util.js";
import {equate_Iterables} from "src/base/Equate.js";
import {describe} from "src/base/Describe.js";
import {ExternalStabilizer} from "src/sim/external_stabilizer.js";
import {stim} from "src/ext/stim.js";
import {text_diagram_to_edge_list} from "src/sim/text_diagram_to_graph.js";


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
 * A ZX graph represented as an edge list between node indices.
 */
class ZxEdgeList {
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
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof ZxEdgeList)) {
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
     * @param {!string} text_diagram
     * @returns {!ZxEdgeList}
     */
    static from_text_diagram(text_diagram) {
        let {nodes, edges} = text_diagram_to_edge_list(text_diagram, e => {
            let result = NAMED_NODES.get(e);
            if (result === undefined) {
                throw new Error(`Unrecognized ZX node name: '${e}'.`);
            }
            return result;
        });
        return new ZxEdgeList(nodes, edges);
    }

    /**
     * @returns {!Array.<!ExternalStabilizer>}
     */
    external_stabilizers() {
        let sim = new stim.TableauSimulator().deleteLater();

        // Cancel out edge pairs and remove self edges.
        let odd_edges = new Map();
        for (let [a, b] of this.edges) {
            if (a === b) {
                continue;
            }
            let k = `${a},${b}`;
            if (odd_edges.has(k)) {
                odd_edges.delete(k);
            } else {
                odd_edges.set(k, [a, b]);
            }
        }

        // Compute neighbors.
        let neighbor_map = new Map();
        for (let k = 0; k < this.nodes.length; k++) {
            neighbor_map.set(k, []);
        }
        for (let [a, b] of odd_edges.values()) {
            neighbor_map.get(a).push(b);
            neighbor_map.get(b).push(a);
        }

        // Interpret each edge as a cup producing an EPR pair.
        // - The qubits of the EPR pair fly away from the center of the edge, towards their respective nodes.
        // - The qubit keyed by (a, b) is the qubit heading towards b from the edge between a and b.
        let qubit_ids = new Map();
        for (let [a, b] of odd_edges.values()) {
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

export {ZxType, ZxEdgeList}
