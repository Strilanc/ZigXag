import {GeneralMap} from "src/base/GeneralMap.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {Measurement} from "src/sim/Measurement.js"
import {Complex} from "src/base/Complex.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {BitTable} from "src/sim/BitTable.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {LoggedSimulation} from "src/sim/LoggedSimulator.js";
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";


/**
 * @param {!ZxGraph} graph
 * @param {!ZxNode} node
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _nodeStabilizers(graph, node, qubit_map) {
    let ports = graph.activePortsOf(node);
    let kind = graph.kind(node);

    if (kind === 'in' || kind === 'out') {
        return [];
    }

    if (kind === 'O' || kind === '@') {
        if (ports.length === 0) {
            return [];
        }

        let axis = kind === '@';
        let qs = ports.map(p => qubit_map.get(p));

        let result = [];
        result.push(PauliProduct.fromXzParity(qubit_map.size, axis, qs));
        for (let i = 1; i < qs.length; i++) {
            result.push(PauliProduct.fromXzParity(qubit_map.size, !axis, [qs[0], qs[i]]));
        }
        return result;
    }

    if (kind === '+') {
        let result = [];
        for (let portPair of graph.activeCrossingPortPairs(node)) {
            let qs = portPair.map(p => qubit_map.get(p));
            result.push(
                PauliProduct.fromSparseByType(qubit_map.size, {X: qs}),
                PauliProduct.fromSparseByType(qubit_map.size, {Z: qs}));
        }
        return result;
    }


    throw new Error(`Unrecognized node kind ${kind}.`);
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxEdge} edge
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _edgeStabilizers(graph, edge, qubit_map) {
    let [p1, p2] = edge.ports();
    let kind = graph.kind(edge);
    let q1 = qubit_map.get(p1);
    let q2 = qubit_map.get(p2);

    if (kind === '-') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: [q1, q2]}),
            PauliProduct.fromSparseByType(qubit_map.size, {Z: [q1, q2]}),
        ];
    }

    if (kind === 'h') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: q1, Z: q2}),
            PauliProduct.fromSparseByType(qubit_map.size, {Z: q1, X: q2}),
        ];
    }

    if (kind === 'x') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: [q1, q2]}),
            PauliProduct.fromSparseByType(qubit_map.size, {Z: [q1, q2]}).times(-1),
        ];
    }

    if (kind === 'z') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: [q1, q2]}).times(-1),
            PauliProduct.fromSparseByType(qubit_map.size, {Z: [q1, q2]}),
        ];
    }

    if (kind === 's') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: [q1, q2]}),
            PauliProduct.fromSparseByType(qubit_map.size, {Y: q1, Z: q2}),
        ];
    }

    if (kind === 'f') {
        return [
            PauliProduct.fromSparseByType(qubit_map.size, {X: q1, Y: q2}).times(-1),
            PauliProduct.fromSparseByType(qubit_map.size, {Z: [q1, q2]}),
        ];
    }

    throw new Error(`Unrecognized edge kind ${kind}.`);
}

/**
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @returns {!Array.<!PauliProduct>}
 */
function stabilizerTableOfGraph(graph, qubit_map) {
    let stabilizers = [];

    for (let node of graph.nodes.keys()) {
        stabilizers.push(..._nodeStabilizers(graph, node, qubit_map));
    }

    for (let edge of graph.edges.keys()) {
        stabilizers.push(..._edgeStabilizers(graph, edge, qubit_map));
    }

    return stabilizers;
}

/**
 * @param {!Array.<!PauliProduct>} stabilizers
 * @param {!int} numInOut
 * @returns {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>}
 * @private
 */
function _controlMap(stabilizers, numInOut) {
    let reduced = PauliProduct.gaussianEliminate(stabilizers);

    let width = reduced.length === 0 ? 0 : reduced[0].paulis.length;
    let spiderRegionSize = width - numInOut;
    let controlMap = /** @type {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>} */ new GeneralMap();

    for (let stabilizer of reduced) {
        let spiderRegion = stabilizer.slice(0, spiderRegionSize);
        if (spiderRegion.xzBitWeight() === 0) {
            continue;
        }

        // Note how the spider region axis interacts with the in/out region.
        let [head, ...implied] = spiderRegion.activeQubitAxes();
        if (controlMap.has(head)) {
            throw new Error('Redundant control.')
        }
        for (let t of implied) {
            if (controlMap.get(t, undefined) !== undefined) {
                throw new Error('Inconsistent implied control.')
            }
            controlMap.set(t, undefined);
        }
        let updates = stabilizer.activeQubitAxes().filter(e => e.qubit >= spiderRegionSize);
        controlMap.set(head, updates);
    }

    return controlMap;
}

/**
 * @param {!Array.<!PauliProduct>} stabilizers
 * @param {!Array.<StabilizingMeasurement>} spiderMeasurements
 * @param {!int} numIn
 * @param {!int} numOut
 * @returns {!GeneralMap<!QubitAxis, !Array.<!int>>} Map from in/out axis to measurement qubits that flip it.
 */
function graphStabilizersToMeasurementFixupActions(stabilizers, spiderMeasurements, numIn, numOut) {
    let controlMap = _controlMap(stabilizers, numIn + numOut);
    let width = stabilizers.length === 0 ? 0 : stabilizers[0].paulis.length;
    let spiderRegionSize = width - numIn - numOut;
    let out = new GeneralMap();
    for (let i = spiderRegionSize; i < width; i++) {
        out.set(QubitAxis.x(i), []);
        out.set(QubitAxis.z(i), []);
    }

    for (let spider of spiderMeasurements) {
        if (!controlMap.has(spider.currentAxis)) {
            throw new Error('Uncontrollable measurement.');
        }
        let flips = controlMap.get(spider.currentAxis);
        if (flips !== undefined) {
            for (let flip of flips) {
                out.get(flip).push(spider.currentAxis.qubit);
            }
        }
    }

    return out;
}

/**
 * @param {!ZxGraph} graph
 * @returns {!{portToQubitMap: !GeneralMap<!ZxPort, !int>, num_inputs: !int, num_outputs: !int}}
 */
function generatePortToQubitMap(graph) {
    let portToQubitMap = /** @type {!GeneralMap<!ZxPort, !int>} */ new GeneralMap();

    // Sort and classify nodes.
    let inputNodes = graph.inputNodes();
    let outputNodes = graph.outputNodes();
    let measurementNodes = graph.spiderMeasurementNodes();
    let crossingNodes = graph.crossingNodes();
    if (inputNodes.length + outputNodes.length + measurementNodes.length + crossingNodes.length !== graph.nodes.size) {
        throw new Error('Unrecognized node(s).');
    }

    // CAREFUL: The order of the nodes' qubits matters!
    // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
    // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.

    // Internal nodes go first.
    for (let node of crossingNodes) {
        for (let p of graph.activePortsOf(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }
    for (let {node} of measurementNodes) {
        for (let p of graph.activePortsOf(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }

    // Then input nodes.
    for (let node of inputNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    // And lastly output nodes.
    for (let node of outputNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    return {portToQubitMap, num_inputs: inputNodes.length, num_outputs: outputNodes.length};
}

/**
 * @param {!LoggedSimulation} state
 * @param {!Array.<!PauliProduct>} graphStabilizers
 * @param {!Array.<!StabilizingMeasurement>} spiderMeasurements
 * @param {!int} numIn
 * @param {!int} numOut
 */
function _zxEval_updatePauliFrame(state, graphStabilizers, spiderMeasurements, numIn, numOut) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Adjust Pauli frame based on measurements.');

    let actions = graphStabilizersToMeasurementFixupActions(graphStabilizers, spiderMeasurements, numIn, numOut);
    let activeMeasurements = new Set(spiderMeasurements.filter(e => e.result).map(e => e.currentAxis.qubit));
    for (let [target, parityControls] of actions.entries()) {
        state.feedback(parityControls, activeMeasurements, target);
    }
}

/**
 * @param {!ZxGraph} graph
 * @returns {!{wavefunction: !Matrix, stabilizers: !Array.<!PauliProduct>, qasm: !string, quirk_url: !string}}
 */
function evalZxGraph(graph) {
    // Prepare simulator.
    let {portToQubitMap, num_inputs: num_in, num_outputs: num_out} = generatePortToQubitMap(graph);
    let raw_sim = new ChpSimulator(portToQubitMap.size);
    let state = new LoggedSimulation(raw_sim);
    for (let k = 0; k < portToQubitMap.size; k++) {
        state.sim.qalloc();
    }

    // Perform operations congruent to the ZX graph.
    _zxEval_initEprPairs(graph, state, portToQubitMap);
    let spiderMeasurements = _zxEval_performSpiderMeasurements(graph, state, portToQubitMap);
    let graphStabilizers = stabilizerTableOfGraph(graph, portToQubitMap);
    _zxEval_updatePauliFrame(state, graphStabilizers, spiderMeasurements, num_in, num_out);

    // Derive wavefunction and etc for caller.
    return _zxEval_packageOutput(state, portToQubitMap, num_in, num_out);
}

class StabilizingMeasurement {
    /**
     * @param {!PauliProduct} originalStabilizer
     * @param {!QubitAxis} postselectionControlAxis
     * @param {!QubitAxis} currentAxis
     * @param {undefined|!boolean} result
     */
    constructor(originalStabilizer, currentAxis, postselectionControlAxis, result=undefined) {
        this.originalStabilizer = originalStabilizer;
        this.currentAxis = currentAxis;
        this.postselectionControlAxis = postselectionControlAxis;
        this.result = result;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof StabilizingMeasurement &&
            this.currentAxis.isEqualTo(other.currentAxis) &&
            this.originalStabilizer.isEqualTo(other.originalStabilizer) &&
            this.postselectionControlAxis.isEqualTo(other.postselectionControlAxis) &&
            this.result === other.result);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `originalStabilizer: ${this.originalStabilizer}
postselectionControlAxis: ${this.postselectionControlAxis}
currentAxis: ${this.currentAxis}
result: ${this.result}`;
    }
}

/**
 * @param {!ZxGraph} graph
 * @param {!LoggedSimulation} state
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @private
 */
function _zxEval_initEprPairs(graph, state, portToQubitMap) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Init per-edge EPR pairs.');

    // Identify edge qubit pairs.
    let pairs = [...graph.edges.entries()].map(ek => {
        let [e, kind] = ek;
        let qs = e.ports().map(p => portToQubitMap.get(p));
        qs.sort((a, b) => a - b);
        return [qs, kind];
    });
    pairs.sort((a, b) => (a[0][0] - b[0][0])*10000 + (a[0][1] - b[0][1]));

    // Make + states.
    let heads = pairs.map(e => e[0][0]);
    state.initPlus(heads);

    // Expand + states into EPR pairs.
    for (let [[q0, q1], _] of pairs) {
        state.cnot(q0, q1);
    }

    let knownBasisChanges = ['h', 'x', 'z', 's', 'f'];
    let basisChanges = pairs.filter(e => knownBasisChanges.indexOf(e[1]) !== -1).map(e => [e[0][1], e[1]]);
    state.basisChange(basisChanges);
}

/**
 * @param {!int} n
 * @param {!LoggedSimulation} state
 * @param {!Array.<!int>} qubitIds
 * @param {!boolean} axis
 * @returns {!Array.<!StabilizingMeasurement>}
 * @private
 */
function _prepSpiderMeasurement(n, state, qubitIds, axis) {
    if (qubitIds.length === 0) {
        return [];
    }
    let [head, ...tail] = qubitIds;
    state.cnot(head, tail, !axis, axis);
    let result = [];
    result.push(new StabilizingMeasurement(
        PauliProduct.fromXzParity(n, axis, qubitIds),
        new QubitAxis(head, axis),
        new QubitAxis(head, !axis)));
    for (let t of tail) {
        result.push(new StabilizingMeasurement(
            PauliProduct.fromXzParity(n, !axis, [head, t]),
            new QubitAxis(t, !axis),
            new QubitAxis(t, axis)));
    }
    return result;
}

/**
 * @param {!LoggedSimulation} state
 * @param {!Array.<!StabilizingMeasurement>} stabilizingMeasurements
 * @private
 */
function _fillStabilizerMeasurementResults(state, stabilizingMeasurements) {
    // Group.
    let xMeasured = stabilizingMeasurements.filter(e => !e.currentAxis.axis).map(e => e.currentAxis.qubit);
    let allMeasured = stabilizingMeasurements.map(e => e.currentAxis.qubit);
    allMeasured.sort((a, b) => a - b);

    // Act.
    state.hadamard(xMeasured);
    let measurementResults = state.measure(allMeasured);

    // Scatter.
    let qubitToResultMap = {};
    for (let i = 0; i < allMeasured.length; i++) {
        qubitToResultMap[allMeasured[i]] = measurementResults[i];
    }
    for (let e of stabilizingMeasurements) {
        e.result = qubitToResultMap[e.currentAxis.qubit];
    }
}

/**
 * @param {!ZxGraph} graph
 * @param {!LoggedSimulation} state
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @returns {!Array.<!StabilizingMeasurement>}
 * @private
 */
function _zxEval_performSpiderMeasurements(graph, state, portToQubitMap) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Perform per-node spider measurements.');
    let n = portToQubitMap.size;

    // Perform 2-qubit operations and determine what to measure.
    let stabilizingMeasurements = /** @type {!Array.<StabilizingMeasurement>} */ [];
    for (let {node, axis} of graph.spiderMeasurementNodes()) {
        let qubits = graph.activePortsOf(node).map(p => portToQubitMap.get(p));
        stabilizingMeasurements.push(..._prepSpiderMeasurement(n, state, qubits, axis));
    }

    // Perform Bell measurements on crossing lines.
    for (let node of graph.crossingNodes()) {
        for (let pair of graph.activeCrossingPortPairs(node)) {
            let qubits = pair.map(p => portToQubitMap.get(p));
            stabilizingMeasurements.push(..._prepSpiderMeasurement(n, state, qubits, false));
        }
    }

    _fillStabilizerMeasurementResults(state, stabilizingMeasurements);

    return stabilizingMeasurements;
}

/**
 * @param {!LoggedSimulation} state
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @param {!int} numIn
 * @param {!int} numOut
 * @returns {{stabilizers: !Array.<!PauliProduct>, wavefunction: !Matrix, qasm: string, quirk_url: string}}
 * @private
 */
function _zxEval_packageOutput(state, portToQubitMap, numIn, numOut) {
    let numKept = numIn + numOut;

    let qasm = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        `qreg q[${portToQubitMap.size}]`,
        `creg m[${portToQubitMap.size - numKept}]`,
        ...state.qasm_logger.lines,
    ].join('\n');

    state.quirk_logger.sparse([portToQubitMap.size - numKept, `Amps${numKept}`]);
    let quirk_url = state.quirk_logger.url();

    let simStateStabilizers = _extractRemainingStabilizers(state.sim, numKept);

    let wavefunction = stabilizerStateToWavefunction(simStateStabilizers);
    wavefunction = new Matrix(1 << numIn, 1 << numOut, wavefunction.rawBuffer());

    return {
        stabilizers: simStateStabilizers,
        wavefunction: wavefunction,
        qasm: qasm,
        quirk_url: quirk_url,
    };
}

/**
 * @param {!ChpSimulator} stabilizerSim
 * @param {!int} numKept
 * @returns {!Array.<!PauliProduct>}
 * @private
 */
function _extractRemainingStabilizers(stabilizerSim, numKept) {
    // Extract and normalize stabilizers from simulator.
    let lines = stabilizerSim.toString().split('\n');
    lines = lines.slice(1 + (lines.length >> 1));
    let paulis = PauliProduct.gaussianEliminate(lines.map(PauliProduct.fromString));

    // Only keep lower right of table (the unmeasured qubits).
    lines = paulis.map(e => e.toString());
    lines = lines.slice(lines.length - numKept).map(e => e[0] + e.slice(e.length - numKept));
    paulis = lines.map(PauliProduct.fromString);

    // Normalize
    return PauliProduct.gaussianEliminate(paulis);
}

export {evalZxGraph}
