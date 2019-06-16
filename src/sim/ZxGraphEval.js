import {GeneralMap} from "src/base/GeneralMap.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {Measurement} from "src/sim/Measurement.js"
import {Complex} from "src/base/Complex.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdgePos, ZxNodePos} from "src/sim/ZxGraph.js"
import {BitTable} from "src/sim/BitTable.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {LoggedSimulation} from "src/sim/LoggedSimulator.js";
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";


/**
 * @param {!ZxGraph} graph
 * @param {!ZxNodePos} node
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
            throw new Error('ports.length === 0');
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

    throw new Error(`Unrecognized node kind ${kind}.`);
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxEdgePos} edge
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
 * @param {!PauliProduct} measuredAxes
 * @param {!int} numIn
 * @param {!int} numOut
 * @returns {!GeneralMap<!QubitAxis, !Array.<!int>>} Remaining qubit axis to measured parity control qubit.
 */
function graphStabilizersToMeasurementFixupActions(stabilizers, measuredAxes, numIn, numOut) {
    stabilizers = PauliProduct.gaussianEliminate(stabilizers);

    let m = stabilizers[0].paulis.length;
    let parityNodeCount = m - numIn - numOut;
    let out = /** @type {!GeneralMap<!QubitAxis, !Array.<!int>>} */ new GeneralMap();
    for (let i = parityNodeCount; i < m; i++) {
        out.set(new QubitAxis(i, false), []);
        out.set(new QubitAxis(i, true), []);
    }

    for (let stabilizer of stabilizers) {
        let weight = stabilizer.xzBitWeight();
        let outputWeight = stabilizer.slice(m - numOut).xzBitWeight();
        let parityRegion = stabilizer.slice(0, parityNodeCount);
        let parityWeight = parityRegion.xzBitWeight();

        // Does it involve measurements we didn't even do?
        let parityRegionAbs = parityRegion.abs();
        if (!parityRegionAbs.bitwiseAnd(measuredAxes).isEqualTo(parityRegionAbs)) {
            // Can't care.
            continue;
        }

        // Is it a redundant row?
        if (weight === 0) {
            // Don't care.
            continue;
        }

        // Is it an assertion about what measurement results are possible?
        if (parityWeight === weight) {
            // Don't care.
            continue;
        }

        // Is it a derived input/output relationship?
        if (parityWeight === 0) {
            // Don't care.
            continue;
        }

        // Is it a measurement?
        if (outputWeight === weight) {
            console.warn("SKIPPING MEASUREMENT");
            continue;
        }

        // Is it parity interaction between the measurements and the output?
        if (parityWeight > 0) {
            // NOTE: When multiple measurement bits are in the stabilizer, it seems like any one of the measurement
            // bits can be used. It seems to indicate those two bits will be set (or not set) simultaneously. Which is
            // surprising... why is it not that *all* of them have to be used?
            let m = parityRegion.firstActiveQubitAxis();
            for (let flip of stabilizer.slice(parityNodeCount).activeQubitAxes()) {
                flip.qubit += parityNodeCount;
                out.get(flip).push(m.qubit);
            }
            continue;
        }

        throw new Error(`Unhandled graphStabilizersToMeasurementFixupActions case: ${stabilizer}`);
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
    let measurementNodes = graph.toricMeasurementNodes();
    if (inputNodes.length + outputNodes.length + measurementNodes.length !== graph.nodes.size) {
        throw new Error('Unrecognized node(s).');
    }

    // CAREFUL: The order of the nodes' qubits matters!
    // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
    // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.

    // Measurement nodes go first.
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
 * @param {!PauliProduct} basis
 * @param {!Array.<!boolean>} results
 * @param {!int} numIn
 * @param {!int} numOut
 */
function _zxEval_updatePauliFrame(state, graphStabilizers, basis, results, numIn, numOut) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Adjust Pauli frame based on measurements.');

    let actions = graphStabilizersToMeasurementFixupActions(graphStabilizers, basis, numIn, numOut);
    for (let [target, parityControls] of actions.entries()) {
        state.feedback(parityControls, results, target);
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
    let {basis, results} = _zxEval_performToricMeasurements(graph, state, portToQubitMap);
    let graphStabilizers = stabilizerTableOfGraph(graph, portToQubitMap);
    _zxEval_updatePauliFrame(state, graphStabilizers, basis, results, num_in, num_out);

    // Derive wavefunction and etc for caller.
    return _zxEval_packageOutput(state, portToQubitMap, num_in, num_out);
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
 * @param {!ZxGraph} graph
 * @param {!LoggedSimulation} state
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @returns {!{basis: !PauliProduct, results: !Array.<!boolean|undefined>}}
 *      The basis is a product of Paulis that were (effectively) measured.
 *      The results array is a parallel array to the basis, with the corresponding measurement results.
 *      The results array will have a false or true at indices corresponding to a Pauli in the basis, and undefined
 *      in other locations.
 * @private
 */
function _zxEval_performToricMeasurements(graph, state, portToQubitMap) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Perform per-node toric measurements.');

    // Perform 2-qubit operations and determine what to measure.
    let xMeasured = [];
    let zMeasured = [];
    for (let {node, axis} of graph.toricMeasurementNodes()) {
        let [head, ...tail] = graph.activePortsOf(node).map(p => portToQubitMap.get(p));
        state.cnot(head, tail, !axis, axis);
        (axis ? zMeasured : xMeasured).push(head);
        (axis ? xMeasured : zMeasured).push(...tail);
    }

    // Perform single-qubit operations and measure.
    let allMeasured = [...xMeasured, ...zMeasured];
    allMeasured.sort((a, b) => a - b);
    state.hadamard(xMeasured);
    let measurementResults = state.measure(allMeasured);
    let basis = PauliProduct.fromSparseByType(portToQubitMap.size, {X: xMeasured, Z: zMeasured});

    // Make the measurement results line up with the basis.
    let expandedResults = [];
    let k = 0;
    for (let q of basis.activeQubitAxes()) {
        while (expandedResults.length < q.qubit) {
            expandedResults.push(undefined);
        }
        expandedResults.push(measurementResults[k]);
        k++;
    }

    return {basis, results: expandedResults};
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
