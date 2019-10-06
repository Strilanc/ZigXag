import {GeneralMap} from "src/base/GeneralMap.js";
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";
import {equate_Maps} from "src/base/Equate.js"
import {Matrix} from "src/base/Matrix.js"
import {NODES} from "src/nodes/All.js";

/**
 * Determines products of Paulis that can be applied after EPR pairs are made, but before spider measurements
 * are performed, without changing the state produced by the graph (up to global phase). This includes both products
 * that are no-ops because they are stabilizers of the EPR pairs as well as products that are no-ops because they
 * exactly match a measurement that is about to be performed.
 *
 * @param {!Graph} graph
 * @param {!GeneralMap.<!string, !int>} portToQubitMap
 * @returns {!Array.<!PauliProduct>}
 */
function fixedPointsOfGraph(graph, portToQubitMap) {
    let fixedPoints = [];

    // Pauli products that are about to be measured are fixed points.
    for (let node of graph.nodes) {
        fixedPoints.push(..._nodeFixedPoints(node, portToQubitMap));
    }

    // Stabilizers of the input state are fixed points.
    for (let edge of graph.edges) {
        fixedPoints.push(..._edgeEprFixedPoints(edge, portToQubitMap));
    }

    return fixedPoints;
}

/**
 * Translates a dense pauli product over some small number of qubits into a sparse pauli product over n qubits.
 *
 * @param {!PauliProduct} product
 * @param {!int} newLen The total number of qubits in the new representation.
 * @param {!Array.<!int>} newSparseIndices The new qubit indices. Length must equal the length of the product.
 * @returns {!PauliProduct}
 * @private
 */
function _scatterPauliProduct(product, newLen, newSparseIndices) {
    return PauliProduct.fromSparseQubitAxes(
        newLen,
        product.activeQubitAxes().map(axis => new QubitAxis(newSparseIndices[axis.qubit], axis.axis)));
}

/**
 * @param {!Node} node
 * @param {!GeneralMap.<!string, !int>} portToQubitMap
 * @private
 */
function _nodeFixedPoints(node, portToQubitMap) {
    let kind = node.data.kind;

    let nodeKind = NODES.map.get(kind);
    if (nodeKind === undefined) {
        throw new Error(`Unrecognized node kind ${kind} for fixed points.`);
    }
    let qs = node.ports.map(p => portToQubitMap.get(p.id));
    let products = nodeKind.fixedPoints(qs.length);
    return products.map(e => _scatterPauliProduct(e, portToQubitMap.size, qs));
}

/**
 * @param {!Edge} edge
 * @param {!GeneralMap.<!string, !int>} portToQubitMap
 * @private
 */
function _edgeEprFixedPoints(edge, portToQubitMap) {
    let qubits = edge.ports.map(p => portToQubitMap.get(p.id));
    let kind = edge.data.kind;
    let nodeKind = NODES.map.get(kind === '-' ? '@' : kind);
    if (nodeKind === undefined) {
        throw new Error(`Unrecognized edge kind ${kind} for fixed points.`);
    }
    let products = nodeKind.fixedPoints(2);
    return products.map(e => _scatterPauliProduct(e, portToQubitMap.size, qubits));
}

/**
 * Rewrites the set of fixed points internal to the graph into rules for which external elements can be toggled
 * in order to have the same effect as toggling an internal element.
 *
 * In some cases an individual internal toggle will not correspond to any set of external toggles, but a pairing of
 * such internal toggles will. In this case exactly one of the involved internal toggles will be mapped to the external
 * toggle of the pairing, whereas the others are mapped to an 'undefined' rule to indicate the redundancy. This works
 * because this case occurs only when all of the paired internal toggles will be needed at the same time.
 *
 * @param {!Array.<!PauliProduct>} fixedPoints
 * @param {!int} numInternalDegreesOfFreedom The columns of the fixed point table first go over the internal degrees of
 *      freedom, then the external ones. This indicates where the split is located.
 * @returns {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>}
 * @private
 */
function internalToExternalMapFromFixedPoints(fixedPoints, numInternalDegreesOfFreedom) {
    let reducedFixedPoints = PauliProduct.gaussianEliminate(fixedPoints).map(e => e.abs());

    let fixupMap = /** @type {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>} */ new GeneralMap();

    for (let fixedPoint of reducedFixedPoints) {
        let internal = fixedPoint.slice(0, numInternalDegreesOfFreedom);
        if (internal.xzBitWeight() === 0) {
            continue;
        }

        let [control, ...redundantControls] = internal.activeQubitAxes();
        if (fixupMap.has(control)) {
            throw new Error('Control was used twice.')
        }
        for (let pauli of redundantControls) {
            if (fixupMap.get(pauli, undefined) !== undefined) {
                throw new Error('Inconsistent implied control.')
            }
            fixupMap.set(pauli, undefined);
        }
        let externalFlips = fixedPoint.activeQubitAxes().filter(e => e.qubit >= numInternalDegreesOfFreedom);
        fixupMap.set(control, externalFlips);
    }

    return fixupMap;
}

class QubitInventory {
    /**
     * @param {!int} numQubits
     * @param {!int} numIn
     * @param {!int} numOut
     * @param {!int} numPost
     */
    constructor(numQubits, numIn, numOut, numPost) {
        this.numQubits = numQubits;
        this.numIn = numIn;
        this.numOut = numOut;
        this.numPost = numPost;
    }

    get numExternal() {
        return this.numIn + this.numOut + this.numPost;
    }

    get numInternal() {
        return this.numQubits - this.numExternal;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof QubitInventory &&
            this.numQubits === other.numQubits &&
            this.numIn === other.numIn &&
            this.numOut === other.numOut &&
            this.numPost === other.numPost);
    }
}

class PortQubitMapping {
    /**
     * @param {!Map.<!string, !int>} map
     * @param {!int} numIn
     * @param {!int} numOut
     * @param {!int} numPost
     */
    constructor(map, numIn, numOut, numPost) {
        this.map = map;
        this.numQubits = new Set(map.values()).size;
        this.numIn = numIn;
        this.numOut = numOut;
        this.numPost = numPost;
    }

    /**
     * @returns {!QubitInventory}
     */
    inventory() {
        return new QubitInventory(
            this.numQubits,
            this.numIn,
            this.numOut,
            this.numPost);
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof PortQubitMapping &&
            equate_Maps(this.map, other.map) &&
            this.numIn === other.numIn &&
            this.numOut === other.numOut &&
            this.numPost === other.numPost);
    }

    get numExternal() {
        return this.numIn + this.numOut + this.numPost;
    }

    get numInternal() {
        return this.numQubits - this.numExternal;
    }
}

class AnalyzedQuantumProgram {
    /**
     *@param {!Array.<!PauliProduct>} stabilizers
     *@param {!Matrix} wavefunction
     *@param {!string} qasm
     *@param {!string} quirkUrl
     *@param {!boolean} satisfiable
     *@param {!number} successProbability
     */
    constructor(stabilizers, wavefunction, qasm, quirkUrl, satisfiable, successProbability) {
        this.stabilizers = stabilizers;
        this.wavefunction = wavefunction;
        this.qasm = qasm;
        this.quirkUrl = quirkUrl;
        this.satisfiable = satisfiable;
        this.successProbability = successProbability;
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!PortQubitMapping} portQubitMapping
 * @returns {!AnalyzedQuantumProgram}
 * @private
 */
function analyzeQuantumProgram(outProgram, portQubitMapping) {
    let qasm = outProgram.qasm();
    let quirkUrl = outProgram.quirkUrl();

    let wantZeroSim = new ChpSimulator(portQubitMapping.numQubits, 0);
    let wantZeroOut = {
        measurements: [],
        successProbability: 1.0,
    };
    try {
        outProgram.interpret(wantZeroSim, wantZeroOut);
    } finally {
        wantZeroSim.destruct();
    }
    let satisfiable = wantZeroOut.measurements.every(e => !e[1]);

    let sim = new ChpSimulator(portQubitMapping.numQubits);
    let out = {
        measurements: [],
        successProbability: 1.0,
    };
    let stabilizers;
    try {
        outProgram.interpret(sim, out);
        stabilizers = _extractRemainingStabilizers(
            sim,
            portQubitMapping.numInternal,
            portQubitMapping.numIn + portQubitMapping.numOut);
    } finally {
        sim.destruct();
    }

    let wavefunction = stabilizerStateToWavefunction(stabilizers);
    wavefunction = new Matrix(1 << portQubitMapping.numIn, 1 << portQubitMapping.numOut, wavefunction.rawBuffer());

    return new AnalyzedQuantumProgram(
        stabilizers,
        wavefunction,
        qasm,
        quirkUrl,
        satisfiable,
        out.successProbability);
}

/**
 * When all other qubits have been measured, this extracts the stabilizers of the remaining unmeasured qubits (whose
 * indices must be contiguous).
 *
 * @param {!ChpSimulator} stabilizerSim The simulator with partially measured state.
 * @param {!int} offset Start of contiguous indices of unmeasured qubits.
 * @param {!int} len Number of unmeasured qubits.
 * @returns {!Array.<!PauliProduct>} The `len` stabilizers of the simulator's state.
 * @private
 */
function _extractRemainingStabilizers(stabilizerSim, offset, len) {
    // Extract and normalize stabilizers from simulator.
    let lines = stabilizerSim.toString().split('\n');
    lines = lines.slice(1 + (lines.length >> 1)); // Skip the 'destabilizers' and dividing line.
    let paulis = PauliProduct.gaussianEliminate(lines.map(PauliProduct.fromString));

    // Only keep the subtable corresponding to the unmeasured qubits.
    lines = paulis.map(e => e.toString());
    lines = lines.slice(offset, offset + len).map(e => e[0] + e.slice(1 + offset, 1 + offset + len));
    paulis = lines.map(PauliProduct.fromString);

    // Normalize
    return PauliProduct.gaussianEliminate(paulis);
}

export {
    fixedPointsOfGraph,
    internalToExternalMapFromFixedPoints,
    PortQubitMapping,
    analyzeQuantumProgram,
    AnalyzedQuantumProgram,
    QubitInventory,
}
