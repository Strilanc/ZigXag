import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";
import {MultiCnot} from "src/sim/QuantumProgram.js";
import {ZxNodeKind, TransformedMeasurement} from "src/nodes/ZxNodeKind.js"
import {
    nodeDrawer,
    xBasisEqualityMatrix,
    zBasisEqualityMatrix,
    NO_EDGE_ACTION,
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
        outProgram.statements.push(new MultiCnot(head, tail, !axis, axis));
        let measurements = [];
        measurements.push(new TransformedMeasurement(
            PauliProduct.fromXzParity(totalQubits, axis, qubitIds),
            new QubitAxis(head, axis),
            new QubitAxis(head, !axis)));
        for (let t of tail) {
            measurements.push(new TransformedMeasurement(
                PauliProduct.fromXzParity(totalQubits, !axis, [head, t]),
                new QubitAxis(t, !axis),
                new QubitAxis(t, axis)));
        }
        return measurements;
    };
}

/**
 * @yields {!ZxNodeKind}
 */
function* generateSpiderNodes() {
    for (let axis of [false, true]) {
        let nodeDraw = nodeDrawer(
            'black',
            axis ? 'black' : 'white',
            1);
        let textColor = axis ? 'white' : 'black';
        let axisPostChar = axis ? '+' : '0';
        let axisAntiPostChar = axis ? '-' : '1';
        let spider = axis ? 'Z' : 'X';
        let oppSpider = axis ? 'X' : 'Z';
        let desc = (selected, modifier, sign, gate) => {
            return [
                `${spider} spider`,
                modifier === '' ? [] : [`(${modifier})`],
                '',
                'Fixed measures:',
                `∀k: ${spider}0·${spider}k`,
                `${sign}Πk(${oppSpider}k)`,
                '',
                'Action:',
                gate
            ].join('\n');
        };

        let nodeMeasurer = _spiderMeasurer(!axis);

        let spiderTensor = phase => {
            let method = axis ? zBasisEqualityMatrix : xBasisEqualityMatrix;
            return dim => method(0, dim, phase);
        };

        let spiderFixedPoints = rootY => deg => {
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

        yield new ZxNodeKind({
            id: `${axis ? '@' : 'O'}`,
            description: desc(axisPostChar, '', '', 'Identity'),
            diagramReps: axis ? ['@'] : ['O', 'o', '0'],
            contentDrawer: nodeDraw,
            hotkeys: axis ? ['2'] : ['o', '0'],
            hotkeyShiftMask: false,
            mouseHotkey: undefined,
            allowedDegrees: [0, 1, 2, 3, 4],
            fixedPoints: spiderFixedPoints(false),
            tensor: spiderTensor(0),
            edgeAction: NO_EDGE_ACTION,
            nodeMeasurer: nodeMeasurer,
        });

        yield new ZxNodeKind({
            id: `${axis ? 'z' : 'x'}`,
            description: desc(axisAntiPostChar, 'Flipped', '-', spider),
            diagramReps: (axis ? ['Z', 'z'] : ['X', 'x']),
            contentDrawer: concatDrawers(nodeDraw, piDrawer(textColor)),
            hotkeys: axis ? ['z'] : ['x'],
            hotkeyShiftMask: false,
            mouseHotkey: undefined,
            allowedDegrees: [0, 1, 2, 3, 4],
            fixedPoints: spiderFixedPoints(false),
            tensor: spiderTensor(Math.PI),
            edgeAction: {
                quirkGate: axis ? 'Z' : 'X',
                qasmGates: axis ? ['z'] : ['x'],
                sim: (sim, qubit) => {
                    if (axis) {
                        sim.phase(qubit);
                        sim.phase(qubit);
                    } else {
                        sim.hadamard(qubit);
                        sim.phase(qubit);
                        sim.phase(qubit);
                        sim.hadamard(qubit);
                    }
                },
                matrix: axis ? Matrix.square(1, 0, 0, -1) : Matrix.square(0, 1, 1, 0),
            },
            nodeMeasurer: nodeMeasurer,
        });

        yield new ZxNodeKind({
            id: `${axis ? 's' : 'f'}`,
            description: desc(axis ? 'i' : '-i', 'Phased', `-i${spider}0·`, axis ? 'S' : 'H·S·H'),
            diagramReps: axis ? ['S', 's'] : ['F', 'f'],
            contentDrawer: concatDrawers(nodeDraw, halfPiDrawer(textColor)),
            hotkeys: axis ? ['s'] : ['v'],
            hotkeyShiftMask: false,
            mouseHotkey: undefined,
            allowedDegrees: [0, 1, 2, 3, 4],
            fixedPoints: spiderFixedPoints(true),
            tensor: spiderTensor(Math.PI / 2),
            edgeAction: {
                quirkGate: axis ? 'Z^½' : 'X^½',
                qasmGates: axis ? ['s'] : ['h', 's', 'h'],
                sim: (sim, qubit) => {
                    if (axis) {
                        sim.phase(qubit);
                    } else {
                        sim.hadamard(qubit);
                        sim.phase(qubit);
                        sim.hadamard(qubit);
                    }
                },
                matrix: axis ?
                    Matrix.square(1, 0, 0, Complex.I) :
                    Matrix.square(1, Complex.I.neg(), Complex.I.neg(), 1).times(new Complex(0.5, 0.5)),
            },
            nodeMeasurer: nodeMeasurer,
        });

        yield new ZxNodeKind({
            id: `${axis ? 'a' : 'w'}`,
            description: desc(axis ? '-i' : 'i', 'Backphased', `i${spider}0·`, axis ? 'S†' : 'H·S†·H'),
            diagramReps: axis ? ['A', 'a'] : ['W', 'w'],
            contentDrawer: concatDrawers(nodeDraw, negHalfPiDrawer(textColor)),
            hotkeys: axis ? ['a'] : ['w'],
            hotkeyShiftMask: false,
            mouseHotkey: undefined,
            allowedDegrees: [0, 1, 2, 3, 4],
            fixedPoints: spiderFixedPoints(true),
            tensor: spiderTensor(-Math.PI / 2),
            edgeAction: {
                quirkGate: axis ? 'Z^-½' : 'X^-½',
                qasmGates: axis ? ['z', 's'] : ['x', 'h', 's', 'h'],
                sim: (sim, qubit) => {
                    if (axis) {
                        sim.phase(qubit);
                        sim.phase(qubit);
                        sim.phase(qubit);
                    } else {
                        sim.hadamard(qubit);
                        sim.phase(qubit);
                        sim.phase(qubit);
                        sim.phase(qubit);
                        sim.hadamard(qubit);
                    }
                },
                matrix: axis ?
                    Matrix.square(1, 0, 0, Complex.I.neg()) :
                    Matrix.square(1, Complex.I, Complex.I, 1).times(new Complex(0.5, -0.5)),
            },
            nodeMeasurer: nodeMeasurer,
        });
    }
}

const SPIDER_NODES = [...generateSpiderNodes()];

export {SPIDER_NODES}
