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
 * @param {!LoggedSimulation} state
 * @param {!Array.<!int>} qubits
 * @param {!Array.<!int>} xMeasurements
 * @param {!Array.<!int>} zMeasurements
 * @param {!number|undefined=undefined} bias
 */
function toric_measurement_x(state, qubits, xMeasurements, zMeasurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    let [head, ...tail] = qubits;
    state.cnot(head, tail);
    xMeasurements.push(head);
    zMeasurements.push(...tail);
}


/**
 * @param {!LoggedSimulation} state
 * @param {!Array.<!int>} qubits
 * @param {!number|undefined=undefined} bias
 * @param {!Array.<!int>} xMeasurements
 * @param {!Array.<!int>} zMeasurements
 */
function toric_measurement_z(state, qubits, xMeasurements, zMeasurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    let [head, ...tail] = qubits;
    state.cnot(head, tail, false, true);
    zMeasurements.push(head);
    xMeasurements.push(...tail);
}

/**
 * @param {!ZxGraph} g
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @returns {!Array.<!PauliProduct>}
 */
function stabilizerTableOfGraph(g, qubit_map) {
    let stabilizers = [];

    let addProd = (type, qubits) => {
        let d = {};
        d[type] = qubits;
        stabilizers.push(PauliProduct.fromSparseByType(qubit_map.size, d));
    };

    for (let [n, kind] of g.nodes.entries()) {
        let ports = g.ports_of(n);
        if (['O', '@'].indexOf(kind) !== -1) {
            if (ports.length === 0) {
                throw new Error('edges.length === 0');
            }

            let axis1 = kind === '@' ? 'Z' : 'X';
            let axis2 = kind === '@' ? 'X' : 'Z';
            let qs = ports.map(p => qubit_map.get(p));
            addProd(axis1, qs);

            for (let i = 1; i < qs.length; i++) {
                addProd(axis2, [qs[0], qs[i]]);
            }
        }
    }
    for (let [e, kind] of g.edges.entries()) {
        if (kind === '-') {
            let [p1, p2] = e.ports();
            let q1 = qubit_map.get(p1);
            let q2 = qubit_map.get(p2);
            addProd('X', [q1, q2]);
            addProd('Z', [q1, q2]);
        }
    }

    return stabilizers;
}


/**
 * @param {!Array.<!PauliProduct>} stabilizers
 * @param {!PauliProduct} measuredAxes
 * @param {!int} rightKeepLen
 * @returns {!GeneralMap<!QubitAxis, !Array.<!int>>} Remaining qubit axis to measured parity control qubit.
 */
function graphStabilizersToMeasurementFixupActions(stabilizers, measuredAxes, rightKeepLen) {
    stabilizers = PauliProduct.gaussianEliminate(stabilizers);

    let m = stabilizers[0].paulis.length;
    let leftUpdateLen = m - rightKeepLen;
    let out = /** @type {!GeneralMap<!int, !Array.<!int>>} */ new GeneralMap();
    for (let i = leftUpdateLen; i < m; i++) {
        out.set(new QubitAxis(i, false), []);
        out.set(new QubitAxis(i, true), []);
    }

    for (let stabilizer of stabilizers) {
        let inputOutputRegion = stabilizer.slice(leftUpdateLen);
        let measuredRegion = stabilizer.slice(0, leftUpdateLen);

        if (measuredRegion.xzBitWeight() !== 1) {
            continue;
        }

        let m = measuredRegion.xzSingleton();
        if (measuredAxes._hasPauliXZ(m.qubit, m.axis)) {
            for (let flip of inputOutputRegion.activeQubitAxes()) {
                flip.qubit += leftUpdateLen;
                out.get(flip).push(m.qubit);
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
    let nodes = [...graph.nodes.keys()];
    nodes.sort();
    let inputNodes = nodes.filter(node => graph.nodes.get(node) === 'in');
    let outputNodes = nodes.filter(node => graph.nodes.get(node) === 'out');
    let measurementNodes = nodes.filter(node => ['O', '@'].indexOf(graph.nodes.get(node)) !== -1);
    if (inputNodes.length + outputNodes.length + measurementNodes.length !== nodes.length) {
        throw new Error('Unrecognized node(s).');
    }

    // CAREFUL: The order of the nodes' qubits matters!
    // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
    // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.

    // Measurement nodes go first.
    for (let node of measurementNodes) {
        for (let p of graph.ports_of(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }

    // Then input nodes.
    for (let node of inputNodes) {
        let ports = graph.ports_of(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    // And lastly output nodes.
    for (let node of outputNodes) {
        let ports = graph.ports_of(node);
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
 * @param {!int} num_unmeasured
 */
function _zxEval_updatePauliFrame(state, graphStabilizers, basis, results, num_unmeasured) {
    state.qasm_logger.lines.push('');
    state.qasm_logger.lines.push('// Adjust Pauli frame based on measurements.');

    let actions = graphStabilizersToMeasurementFixupActions(graphStabilizers, basis, num_unmeasured);
    for (let target of actions.keys()) {
        let parityControls = actions.get(target);
        if (parityControls.length === 0) {
            continue;
        }
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
    _zxEval_updatePauliFrame(state, graphStabilizers, basis, results, num_in + num_out);

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
    let pairs = [...graph.edges.keys()].map(e => {
        let qs = e.ports().map(p => portToQubitMap.get(p));
        qs.sort();
        return qs;
    });
    pairs.sort();

    // Make + states.
    let heads = pairs.map(e => e[0]);
    state.initPlus(heads);

    // Expand + states into EPR pairs.
    for (let [q0, q1] of pairs) {
        state.cnot(q0, q1);
    }
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
    let nodes = [...graph.nodes.keys()];
    nodes.sort();

    // Perform 2-qubit operations and determine what to measure.
    let xMeasured = [];
    let zMeasured = [];
    for (let n of nodes) {
        let kind = graph.nodes.get(n);
        let edges = graph.edges_of(n);
        if (['O', '@'].indexOf(kind) !== -1) {
            let measure_func = kind === '@' ? toric_measurement_x : toric_measurement_z;
            let node_qubits = edges.map(e => portToQubitMap.get(new ZxPort(e, n)));
            measure_func(state, node_qubits, xMeasured, zMeasured);
        } else if (['in', 'out'].indexOf(kind) === -1) {
            throw new Error(`Unrecognized node kind ${kind}`);
        }
    }

    // Perform single-qubit operations and measure.
    let allMeasured = [...xMeasured, ...zMeasured];
    allMeasured.sort();
    state.hadamard(xMeasured);
    let denseResults = state.measure(allMeasured);
    let basis = PauliProduct.fromSparseByType(portToQubitMap.size, {X: xMeasured, Z: zMeasured});

    // Sparsify.
    let sparseResults = [];
    let denseResultPointer = 0;
    for (let q of basis.activeQubitAxes()) {
        while (sparseResults.length < q.qubit) {
            sparseResults.push(undefined);
        }
        sparseResults.push(denseResults[denseResultPointer]);
        denseResultPointer++;
    }

    return {basis, results: sparseResults};
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
