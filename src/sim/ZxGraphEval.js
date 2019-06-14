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
function measure_toparity_x(log_sim, qubits, x_measurements, z_measurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    log_sim.qasm_log.push(`// toparity x on ${qubits}`);
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
function measure_toparity_z(log_sim, qubits, x_measurements, z_measurements, bias=undefined) {
    if (qubits.length === 0) {
        throw new Error('qubits.length === 0');
    }

    log_sim.qasm_log.push(`// toparity z on ${qubits}`);
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
 * @param {!ZxGraph} g
 * @returns {!{qubit_map: !GeneralMap<!ZxPort, !int>, num_inputs: !int, num_outputs: !int}}
 */
function generatePortToQubitMap(g) {
    let qubit_map = /** @type {!GeneralMap<!ZxPort, !int>} */ new GeneralMap();

    let ks = [...g.nodes.keys()];
    ks.sort();

    for (let n of ks) {
        if (['O', '@'].indexOf(g.nodes.get(n)) !== -1) {
            for (let p of g.ports_of(n)) {
                qubit_map.set(p, qubit_map.size);
            }
        }
    }

    let num_inputs = 0;
    for (let n of ks) {
        if (g.nodes.get(n) === 'in') {
            let ports = g.ports_of(n);
            if (ports.length !== 1) {
                throw new Error('ports.length !== 1')
            }
            num_inputs += 1;
            qubit_map.set(ports[0], qubit_map.size);
        }
    }

    let num_outputs = 0;
    for (let n of ks) {
        if (g.nodes.get(n) === 'out') {
            let ports = g.ports_of(n);
            if (ports.length !== 1) {
                throw new Error('ports.length !== 1')
            }
            num_outputs += 1;
            qubit_map.set(ports[0], qubit_map.size);
        }
    }

    return {qubit_map, num_inputs, num_outputs};
}


/**
 * @param {!LoggedSimulator} log_sim
 * @param {!Array.<!PauliProduct>} graphStabilizers
 * @param {!PauliProduct} mask
 * @param {!int} num_unmeasured
 */
function doFixups(log_sim, graphStabilizers, mask, num_unmeasured) {
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
 * @param {!ZxGraph} g
 * @returns {!{wavefunction: !Matrix, stabilizers: !Array.<!PauliProduct>, qasm: !string, quirk_url: !string}}
 */
function evalZxGraph(g) {
    let {qubit_map, num_inputs: num_in, num_outputs: num_out} = generatePortToQubitMap(g);
    let edge_qubits = new GeneralMap();
    for (let e of g.edges.keys()) {
        let v = e.adjacent_node_positions().map(n => qubit_map.get(new ZxPort(e, n)));
        edge_qubits.set(e, v);
    }

    let raw_sim = new ChpSimulator(qubit_map.size);
    let log_sim = new LoggedSimulator(raw_sim);
    let qs = [];
    while (qs.length < qubit_map.size) {
        qs.push(log_sim.qalloc());
    }

    // Initialize EPR pairs.
    let quirk_init = Seq.repeat(0, qubit_map.size).toArray();
    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Init per-edge EPR pairs.');
    for (let [q0, q1] of edge_qubits.values()) {
        log_sim.sub.hadamard(q0);
        quirk_init[q0] = '+';
        log_sim.cnot(q0, q1);
    }

    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Perform measurements for each node.');
    let nodes = [...g.nodes.keys()];
    nodes.sort();
    let x_measurements = [];
    let z_measurements = [];
    for (let n of nodes) {
        let kind = g.nodes.get(n);
        let edges = g.edges_of(n);
        if (['O', '@'].indexOf(kind) !== -1) {
            let measure_func = kind === '@' ? measure_toparity_x : measure_toparity_z;
            let node_qubits = edges.map(e => qubit_map.get(new ZxPort(e, n)));
            measure_func(log_sim, node_qubits, x_measurements, z_measurements, 0);
        } else if (['in', 'out'].indexOf(kind) === -1) {
            throw new Error(`Unrecognized kind ${kind}`);
        }
    }
    let col2 = Seq.repeat(1, qubit_map.size).toArray();
    let col3 = Seq.repeat(1, qubit_map.size).toArray();
    for (let k of x_measurements) {
        col2[k] = 'H';
        col3[k] = 'Measure';
    }
    for (let k of z_measurements) {
        col3[k] = 'Measure';
    }
    log_sim.quirk_log.push(col2);
    log_sim.quirk_log.push(col3);

    log_sim.qasm_log.push('');
    log_sim.qasm_log.push('// Adjust Pauli frame based on measurements.');
    let mask = PauliProduct.fromSparseByType(qubit_map.size, {X: x_measurements, Z: z_measurements});
    let graphStabilizers = stabilizerTableOfGraph(g, qubit_map);
    doFixups(log_sim, graphStabilizers, mask, num_in + num_out);

    let qasm = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        `qreg q[${qubit_map.size}]`,
        `creg m[${qubit_map.size - num_in - num_out}]`,
        ...log_sim.qasm_log,
    ].join('\n');
    let ampDisp = Seq.repeat(1, qubit_map.size - num_in - num_out).toArray();
    ampDisp.push(`Amps${num_in+num_out}`);
    log_sim.quirk_log.push(ampDisp);
    let quirk_url = `https://algassert.com/quirk#circuit=${JSON.stringify({'cols': log_sim.quirk_log, 'init': quirk_init})}`;
    let stabilizers = _extractRelevantStabilizers(raw_sim, num_in, num_out);

    let wavefunction = stabilizerStateToWavefunction(stabilizers);
    wavefunction = new Matrix(1 << num_in, 1 << num_out, wavefunction.rawBuffer());

    return {stabilizers, wavefunction, qasm, quirk_url};
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
