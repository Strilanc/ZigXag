import {GeneralMap} from "src/base/GeneralMap.js";
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";
import {equate} from "src/base/Equate.js";
import {popcnt} from "src/base/Util.js";
import {padSetTo, QuantumStatement, MultiCnot} from "src/sim/QuantumProgram.js";


/**
 * @param {!int} inDim
 * @param {!int} outDim
 * @param {!number=0} phase
 * @returns {!Matrix}
 */
function zBasisEqualityMatrix(inDim, outDim, phase=0) {
    let result = Matrix.zero(1 << inDim, 1 << outDim);
    let buf = result.rawBuffer();
    buf[0] = 1;
    let c = Complex.polar(1, phase);
    buf[buf.length - 2] += c.real;
    buf[buf.length - 1] += c.imag;
    return result;
}

/**
 * @param {!int} inDim
 * @param {!int} outDim
 * @param {!number=0} phase
 * @returns {!Matrix}
 */
function xBasisEqualityMatrix(inDim, outDim, phase=0) {
    if (inDim + outDim === 0) {
        return Matrix.solo(Complex.polar(1, phase).plus(1));
    }

    let m = Math.sqrt(4 / (1 << (inDim + outDim)));
    let g = Complex.polar(m, phase / 2);
    let even = g.times(Math.cos(phase / 2));
    let odd = g.times(-Math.sin(phase / 2)).times(Complex.I);
    let result = Matrix.zero(1 << inDim, 1 << outDim);
    let buf = result.rawBuffer();
    for (let k = 0; k < buf.length; k += 2) {
        if (popcnt(k) % 2 === 0) {
            buf[k] = even.real;
            buf[k + 1] = even.imag;
        } else {
            buf[k] = odd.real;
            buf[k + 1] = odd.imag;
        }
    }
    return result;
}

/**
 * @param {!string} stroke
 * @param {!string} fill
 * @param {!number} lineWidth
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function nodeDrawer(stroke, fill, lineWidth) {
    return ctx => {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, 2 * Math.PI);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
    };
}

const NO_FIXED_POINTS = deg => [];
const NO_EDGE_ACTION = {
    quirkGate: '…',
    qasmGates: [],
    sim: (sim, qubit) => {},
    matrix: 1,
};
const INVALID_EDGE_ACTION = {
    quirkGate: null,
    qasmGates: null,
    sim: () => { throw new Error('No valid edge action.'); },
    matrix: null,
};

const NO_ACTION_NODE_MEASURER = (outProgram, totalQubits, qubitIds) => [];


export {
    zBasisEqualityMatrix,
    xBasisEqualityMatrix,
    nodeDrawer,
    NO_FIXED_POINTS,
    NO_EDGE_ACTION,
    INVALID_EDGE_ACTION,
    NO_ACTION_NODE_MEASURER,
}
