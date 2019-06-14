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
import {LoggedSimulator} from "src/sim/LoggedSimulator.js";
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";


/**
 * @param {!LoggedSimulator} log_sim
 * @param {!Array.<!int>} qubits
 * @param {!Array.<!int>} x_measurements
 * @param {!Array.<!int>} z_measurements
 * @param {!number|undefined=undefined} bias
 * @returns {!Seq.<T>|!Observable.<!boolean>|Array}
 */
function toric_measurement_x(log_sim, qubits, x_measurements, z_measurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    log_sim.qasm_log.push(`// toric x on ${qubits}`);
    let col = Seq.repeat(1, Math.max(...qubits) + 1).toArray();
    let root = qubits[0];
    for (let i = 1; i < qubits.length; i++) {
        col[qubits[i]] = 'X';
        log_sim.cnot(root, qubits[i]);
        log_sim.quirk_log.pop();
    }
    col[root] = '•';
    x_measurements.push(root);
    z_measurements.push(...qubits.slice(1));
    log_sim.quirk_log.push(col);
    log_sim.hadamard(root);
    log_sim.quirk_log.pop();
    return qubits.map(q => {
        let r = log_sim.measure(q, bias);
        log_sim.quirk_log.pop();
        return r;
    });
}


/**
 * @param {!LoggedSimulator} log_sim
 * @param {!Array.<!int>} qubits
 * @param {!number|undefined=undefined} bias
 * @param {!Array.<!int>} x_measurements
 * @param {!Array.<!int>} z_measurements
 * @returns {!Array.<!Measurement>}
 */
function toric_measurement_z(log_sim, qubits, x_measurements, z_measurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    log_sim.qasm_log.push(`// toric z on ${qubits}`);
    let col = Seq.repeat(1, Math.max(...qubits) + 1).toArray();

    let root = qubits[0];
    for (let i = 1; i < qubits.length; i++) {
        col[qubits[i]] = 'Z';
        log_sim.cnot(qubits[i], root);
        log_sim.quirk_log.pop();
        log_sim.hadamard(qubits[i]);
        log_sim.quirk_log.pop();
    }
    col[root] = '⊖';
    z_measurements.push(root);
    x_measurements.push(...qubits.slice(1));
    log_sim.quirk_log.push(col);
    return qubits.map(q => {
        let r = log_sim.measure(q, bias);
        log_sim.quirk_log.pop();
        return r;
    });
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
 * @returns {!GeneralMap<!QubitAxis, !Array.<!int>>}
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
 * @param {!LoggedSimulator} log_sim
 * @param {!Array.<!PauliProduct>} graphStabilizers
 * @param {!PauliProduct} mask
 * @param {!int} num_unmeasured
 */
function _zxEval_updatePauliFrame(log_sim, graphStabilizers, mask, num_unmeasured) {
    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Adjust Pauli frame based on measurements.');

    let m = mask.paulis.length;
    let actions = graphStabilizersToMeasurementFixupActions(graphStabilizers, mask, num_unmeasured);
    for (let rem of actions.keys()) {
        let flippers = actions.get(rem);
        if (flippers.length === 0) {
            continue;
        }
        if (!rem.axis) {
            log_sim.sub.hadamard(rem.qubit);
        }
        let quirk_col = Seq.repeat(1, m).toArray();
        for (let f of flippers) {
            log_sim.qasm_log.push(`if (m[${f}]) ${rem.axis ? 'x' : 'z'} q[${rem.qubit}];`);
            log_sim.sub.cnot(f, rem.qubit);
            quirk_col[f] = 'Z';
        }
        if (!rem.axis) {
            log_sim.sub.hadamard(rem.qubit);
        }

        quirk_col[rem.qubit] = rem.axis ? '⊖' : '•';
        log_sim.quirk_log.push(quirk_col);
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
    let log_sim = new LoggedSimulator(raw_sim);
    log_sim.quirk_init = Seq.repeat(0, portToQubitMap.size).toArray();
    for (let k = 0; k < portToQubitMap.size; k++) {
        log_sim.qalloc();
    }

    // Perform operations congruent to the ZX graph.
    _zxEval_initEprPairs(graph, log_sim, portToQubitMap);
    let fixupMask = _zxEval_performToricMeasurements(graph, log_sim, portToQubitMap);
    let graphStabilizers = stabilizerTableOfGraph(graph, portToQubitMap);
    _zxEval_updatePauliFrame(log_sim, graphStabilizers, fixupMask, num_in + num_out);

    // Derive wavefunction and etc for caller.
    return _zxEval_packageOutput(log_sim, portToQubitMap, num_in, num_out);
}

/**
 * @param {!ZxGraph} graph
 * @param {!LoggedSimulator} log_sim
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @private
 */
function _zxEval_initEprPairs(graph, log_sim, portToQubitMap) {
    // Identify edge qubit pairs.
    let pairs = [...graph.edges.keys()].map(e => {
        let qs = e.ports().map(p => portToQubitMap.get(p));
        qs.sort();
        return qs;
    });
    pairs.sort();

    // For each edge, create an EPR pair |00> + |11> between its qubits.
    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Init per-edge EPR pairs.');
    for (let [q0, q1] of pairs) {
        log_sim.hadamard(q0);
        log_sim.quirk_log.pop();
        log_sim.quirk_init[q0] = '+';
        log_sim.cnot(q0, q1);
    }
}

/**
 * @param {!ZxGraph} graph
 * @param {!LoggedSimulator} log_sim
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @returns {!PauliProduct} A stabilizer whose Paulis are the relevant measurement qubit axes.
 * @private
 */
function _zxEval_performToricMeasurements(graph, log_sim, portToQubitMap) {
    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Perform measurements for each node.');
    let nodes = [...graph.nodes.keys()];
    nodes.sort();
    let x_measured_qubits = [];
    let z_measured_qubits = [];
    for (let n of nodes) {
        let kind = graph.nodes.get(n);
        let edges = graph.edges_of(n);
        if (['O', '@'].indexOf(kind) !== -1) {
            let measure_func = kind === '@' ? toric_measurement_x : toric_measurement_z;
            let node_qubits = edges.map(e => portToQubitMap.get(new ZxPort(e, n)));
            measure_func(log_sim, node_qubits, x_measured_qubits, z_measured_qubits, 0);
        } else if (['in', 'out'].indexOf(kind) === -1) {
            throw new Error(`Unrecognized node kind ${kind}`);
        }
    }

    let quirkHadamardCol = Seq.repeat(1, portToQubitMap.size).toArray();
    for (let k of x_measured_qubits) {
        quirkHadamardCol[k] = 'H';
    }
    log_sim.quirk_log.push(quirkHadamardCol);

    let quirkMeasureCol = Seq.repeat(1, portToQubitMap.size).toArray();
    for (let k of [...x_measured_qubits, ...z_measured_qubits]) {
        quirkMeasureCol[k] = 'Measure';
    }
    log_sim.quirk_log.push(quirkMeasureCol);

    return PauliProduct.fromSparseByType(portToQubitMap.size, {X: x_measured_qubits, Z: z_measured_qubits});
}

/**
 * @param {!LoggedSimulator} log_sim
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @param {!int} num_in
 * @param {!int} num_out
 * @returns {{stabilizers: !Array.<!PauliProduct>, wavefunction: !Matrix, qasm: string, quirk_url: string}}
 * @private
 */
function _zxEval_packageOutput(log_sim, portToQubitMap, num_in, num_out) {
    let qasm = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        `qreg q[${portToQubitMap.size}]`,
        `creg m[${portToQubitMap.size - num_in - num_out}]`,
        ...log_sim.qasm_log,
    ].join('\n');
    let ampDisp = Seq.repeat(1, portToQubitMap.size - num_in - num_out).toArray();
    ampDisp.push(`Amps${num_in+num_out}`);
    log_sim.quirk_log.push(ampDisp);
    let quirk_url = `https://algassert.com/quirk#circuit=${JSON.stringify({
        'cols': log_sim.quirk_log, 
        'init': log_sim.quirk_init
    })}`;

    let simStateStabilizers = _extractRelevantStabilizers(log_sim.sub, num_in, num_out);
    let wavefunction = stabilizerStateToWavefunction(simStateStabilizers);
    wavefunction = new Matrix(1 << num_in, 1 << num_out, wavefunction.rawBuffer());

    return {
        stabilizers: simStateStabilizers,
        wavefunction: wavefunction,
        qasm: qasm,
        quirk_url: quirk_url,
    };
}

/**
 * @param {!ChpSimulator} sim
 * @param {!int} num_ins
 * @param {!int} num_outs
 * @returns {!Array.<!PauliProduct>}
 * @private
 */
function _extractRelevantStabilizers(sim, num_ins, num_outs) {
    // Extract and normalize stabilizers from simulator.
    let lines = sim.toString().split('\n');
    lines = lines.slice(1 + (lines.length >> 1));
    let paulis = PauliProduct.gaussianEliminate(lines.map(PauliProduct.fromString));

    // Only keep lower right of table.
    let keep = num_ins + num_outs;
    lines = paulis.map(e => e.toString());
    lines = lines.slice(lines.length - keep).map(e => e[0] + e.slice(e.length - keep));
    paulis = lines.map(PauliProduct.fromString);

    // Normalize
    return PauliProduct.gaussianEliminate(paulis);
}

export {evalZxGraph}
