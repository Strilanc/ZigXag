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


/**
 * Returns a wavefunction that satisfies all of the given stabilizers.
 *
 * Assumes that the given stabilizers commute and are consistent.
 *
 * @param {!Array.<!PauliProduct>} stabilizers
 * @returns {!Matrix}
 */
function stabilizerStateToWavefunction(stabilizers) {
    // If we're targeting a unique state, the number of stabilizers should match the number of qubits.
    let num_qubits = stabilizers.length;

    // Start from a random wavefunction so that we almost certainly overlap with the desired stabilizers.
    let sim = new VectorSimulator();
    for (let k = 0; k < num_qubits; k++) {
        sim.qalloc();
    }
    let initialBuf = sim._state.rawBuffer();
    for (let k = 0; k < initialBuf.length; k++) {
        initialBuf[k] = Math.random()*2-1;
    }
    _normalize(initialBuf);

    // Project onto the desired stabilizers.
    for (let stabilizer of stabilizers) {
        if (stabilizer.paulis.length !== num_qubits) {
            throw new Error('stabilizer.paulis.length !== num_qubits');
        }
        _simProjectOntoStabilizer(sim, stabilizer);
    }

    // Canonicalize the global phase.
    let finalBuf = sim._state.rawBuffer();
    _phaseCorrect(finalBuf);

    // Package into a ket.
    return new Matrix(1, finalBuf.length >> 1, finalBuf);
}

/**
 * Applies simulated operations that remove components of the wavefunction that are inconsistent with a stabilizer.
 * @param {!VectorSimulator} sim
 * @param {!PauliProduct} stabilizer
 * @private
 */
function _simProjectOntoStabilizer(sim, stabilizer) {
    if ((stabilizer.phase_exponent & 1) !== 0) {
        throw new Error('imaginary stabilizer');
    }

    // Temporarily adjust simulation basis so that the stabilizer is effectively a product of Zs.
    for (let i = 0; i < stabilizer.paulis.length; i++) {
        let p = stabilizer.paulis[i];
        if (p === 1) {
            sim.hadamard(i);
        } else if (p === 3) {
            sim.phase(i);
            sim.hadamard(i);
        }
    }

    // Determine involved qubits.
    let mask = 0;
    for (let i = 0; i < stabilizer.paulis.length; i++) {
        let p = stabilizer.paulis[i];
        if (p !== 0) {
            mask |= 1 << i;
        }
    }

    // Discard parts of the wavefunction with the wrong parity.
    let buf = sim._state.rawBuffer();
    let correctParity = stabilizer.phase_exponent >> 1;
    for (let k = 0; k < buf.length; k++) {
        if ((popcnt((k >> 1) & mask) & 1) !== correctParity) {
            buf[k] = 0;
        }
    }
    _normalize(buf);

    // Restore simulation basis.
    for (let i = 0; i < stabilizer.paulis.length; i++) {
        let c = stabilizer.paulis[i];
        if (c === 1) {
            sim.hadamard(i);
        } else if (c === 3) {
            sim.hadamard(i);
            sim.phase(i);
        }
    }
}

/**
 * Mutates a Float64Array backing a Matrix so that its 2-norm is equal to 1.
 * @param {!Float64Array} buf
 * @private
 */
function _normalize(buf) {
    let t = 0;
    for (let k = 0; k < buf.length; k++) {
        t += buf[k]*buf[k];
    }
    t = Math.sqrt(t);
    for (let k = 0; k < buf.length; k++) {
        buf[k] /= t;
    }
}

/**
 * Mutates a Float64Array backing a Matrix so that its largest encoded complex value is non-negative and real.
 * @param {!Float64Array} buf
 * @private
 */
function _phaseCorrect(buf) {
    let best = 0;
    let phase = Complex.ONE;
    for (let k = 0; k < buf.length; k += 2) {
        let r = buf[k];
        let i = buf[k+1];
        let d = r*r + i*i;
        if (d > best) {
            best = d;
            phase = new Complex(r, i).unit().conjugate();
        }
    }

    for (let k = 0; k < buf.length; k += 2) {
        let c = new Complex(buf[k], buf[k+1]).times(phase);
        buf[k] = c.real;
        buf[k+1] = c.imag;
    }
}

export {stabilizerStateToWavefunction}
