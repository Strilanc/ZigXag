import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";
import {MultiCnot} from "src/sim/QuantumProgram.js";
import {ZxNodeKind, TransformedMeasurement} from "src/nodes/ZxNodeKind.js"
import {CliffordRotation} from "src/sim/CliffordRotation.js";
import {
    nodeDrawer,
    xBasisEqualityMatrix,
    zBasisEqualityMatrix,
    concatDrawers,
    negHalfPiDrawer,
    halfPiDrawer,
    piDrawer,
} from "src/nodes/Base.js";

/**
 * @param {!boolean} axis
 * @returns {!function(
 *     outProgram: !QuantumProgram,
 *     totalQubits: !int,
 *     qubitIds: !Array.<!int>,
 * ): !Array.<!TransformedMeasurement>}
 * @private
 */
function _spiderMeasurer(axis) {
    return (outProgram, totalQubits, qubitIds) => {
        if (qubitIds.length === 0) {
            return [];
        }
        let [head, ...tail] = qubitIds;
        outProgram.statements.push(new MultiCnot(head, tail, axis, !axis));
        let measurements = [];
        measurements.push(new TransformedMeasurement(
            PauliProduct.fromXzParity(totalQubits, !axis, qubitIds),
            new QubitAxis(head, !axis),
            new QubitAxis(head, axis)));
        for (let t of tail) {
            measurements.push(new TransformedMeasurement(
                PauliProduct.fromXzParity(totalQubits, axis, [head, t]),
                new QubitAxis(t, axis),
                new QubitAxis(t, !axis)));
        }
        return measurements;
    };
}

/**
 * @param {!boolean} axis
 * @param {!int} count
 * @returns {!function(sim: !ChpSimulator, qubit: !int)}
 */
let simAxisPhase = (axis, count) => (sim, qubit) => {
    if (!axis) {
        sim.hadamard(qubit);
    }
    for (let i = 0; i < count; i++) {
        sim.phase(qubit);
    }
    if (!axis) {
        sim.hadamard(qubit);
    }
};

/**
 * @param {!boolean} axis
 * @param {!boolean} rootY
 * @returns {!function(deg: !int): !Array.<!PauliProduct>}
 */
let spiderFixedPointsFunc = (axis, rootY) => deg => {
    if (deg === 0) {
        return [];
    }

    let globalParity = new PauliProduct(0, new Uint8Array(deg));
    for (let i = 0; i < deg; i++) {
        globalParity.paulis[i] = axis ? 1 : 2;
    }
    if (rootY) {
        globalParity.paulis[0] = 3;
    }

    let result = [];
    result.push(globalParity);
    for (let i = 1; i < deg; i++) {
        result.push(PauliProduct.fromXzParity(deg, axis, [0, i]));
    }
    return result;
};

/**
 * @param {!boolean} axis
 * @param {!number} phase
 * @returns {!function(*=): *}
 */
function spiderTensorFunc(axis, phase) {
    let tensorFunc = axis ? zBasisEqualityMatrix : xBasisEqualityMatrix;
    return dim => tensorFunc(0, dim, phase);
}

/**
 * @param {!boolean} axis
 * @yields {!ZxNodeKind}
 */
function* generateSpiderNodes(axis) {
    let spiderNodeDrawer = nodeDrawer('black', axis ? 'black' : 'white', 1);
    let textColor = axis ? 'white' : 'black';
    let spider = axis ? 'Z' : 'X';
    let oppSpider = axis ? 'X' : 'Z';
    let desc = (modifier, sign, gate) => {
        return [
            `${spider} spider`,
            modifier === '' ? [] : [`(${modifier})`],
            '',
            'Fixed measures:',
            `∀k: ${spider}0·${spider}k`,
            `${sign}Πk(${oppSpider}k)`,
            '',
            'Edge action:',
            gate
        ].join('\n');
    };

    let nodeMeasurer = _spiderMeasurer(axis);
    let allowedDegrees = [0, 1, 2, 3, 4];

    yield new ZxNodeKind({
        id: `${axis ? '@' : 'O'}`,
        description: desc('', '', 'Identity'),
        diagramReps: axis ? ['@'] : ['O', 'o', '0'],
        contentDrawer: spiderNodeDrawer,
        hotkeys: axis ? ['2'] : ['o', '0'],
        hotkeyShiftMask: false,
        fixedPoints: spiderFixedPointsFunc(axis, false),
        tensor: spiderTensorFunc(axis, 0),
        allowedDegrees,
        nodeMeasurer,
    });

    yield new ZxNodeKind({
        id: `${axis ? 'z' : 'x'}`,
        description: desc('Flipped', '-', spider),
        diagramReps: (axis ? ['Z', 'z'] : ['X', 'x']),
        contentDrawer: concatDrawers(spiderNodeDrawer, piDrawer(textColor)),
        hotkeys: axis ? ['z'] : ['x'],
        hotkeyShiftMask: false,
        fixedPoints: spiderFixedPointsFunc(axis, false),
        tensor: spiderTensorFunc(axis, Math.PI),
        edgeAction: {
            quirkGate: axis ? 'Z' : 'X',
            qasmGates: axis ? ['z'] : ['x'],
            clifford: axis ? CliffordRotation.Z : CliffordRotation.X,
            sim: simAxisPhase(axis, 2),
            matrix: axis ? Matrix.square(1, 0, 0, -1) : Matrix.square(0, 1, 1, 0),
        },
        allowedDegrees,
        nodeMeasurer,
    });

    yield new ZxNodeKind({
        id: `${axis ? 's' : 'f'}`,
        description: desc('Phased', `-i${spider}0·`, axis ? 'S' : 'H·S·H'),
        diagramReps: axis ? ['S', 's'] : ['F', 'f'],
        contentDrawer: concatDrawers(spiderNodeDrawer, halfPiDrawer(textColor)),
        hotkeys: axis ? ['s'] : ['v'],
        hotkeyShiftMask: false,
        fixedPoints: spiderFixedPointsFunc(axis, true),
        tensor: spiderTensorFunc(axis, Math.PI / 2),
        edgeAction: {
            quirkGate: axis ? 'Z^½' : 'X^½',
            qasmGates: axis ? ['s'] : ['h', 's', 'h'],
            clifford: axis ? CliffordRotation.S : CliffordRotation.Sx,
            sim: simAxisPhase(axis, 1),
            matrix: axis ?
                Matrix.square(1, 0, 0, Complex.I) :
                Matrix.square(1, Complex.I.neg(), Complex.I.neg(), 1).times(new Complex(0.5, 0.5)),
        },
        allowedDegrees,
        nodeMeasurer,
    });

    yield new ZxNodeKind({
        id: `${axis ? 'a' : 'w'}`,
        description: desc('Backphased', `i${spider}0·`, axis ? 'S†' : 'H·S†·H'),
        diagramReps: axis ? ['A', 'a'] : ['W', 'w'],
        contentDrawer: concatDrawers(spiderNodeDrawer, negHalfPiDrawer(textColor)),
        hotkeys: axis ? ['a'] : ['w'],
        hotkeyShiftMask: false,
        fixedPoints: spiderFixedPointsFunc(axis, true),
        tensor: spiderTensorFunc(axis, -Math.PI / 2),
        edgeAction: {
            quirkGate: axis ? 'Z^-½' : 'X^-½',
            qasmGates: axis ? ['z', 's'] : ['x', 'h', 's', 'h'],
            clifford: axis ? CliffordRotation.S.inv() : CliffordRotation.Sx.inv(),
            sim: simAxisPhase(axis, 3),
            matrix: axis ?
                Matrix.square(1, 0, 0, Complex.I.neg()) :
                Matrix.square(1, Complex.I, Complex.I, 1).times(new Complex(0.5, -0.5)),
        },
        allowedDegrees,
        nodeMeasurer,
    });
}

const SPIDER_NODES = [...generateSpiderNodes(false), ...generateSpiderNodes(true)];

export {SPIDER_NODES}
