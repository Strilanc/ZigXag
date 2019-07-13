import {GeneralMap} from "src/base/GeneralMap.js";
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";
import {equate} from "src/base/Equate.js";
import {popcnt} from "src/base/Util.js";
import {padSetTo, QuantumStatement, MultiCnot} from "src/sim/QuantumProgram.js";
import {ZxNodeKind, TransformedMeasurement} from "src/nodes/ZxNodeKind.js"
import {
    nodeDrawer,
    NO_FIXED_POINTS,
    xBasisEqualityMatrix,
    zBasisEqualityMatrix,
    INVALID_EDGE_ACTION,
    NO_EDGE_ACTION,
    NO_ACTION_NODE_MEASURER,
} from "src/nodes/Base.js";

import {INPUT_NODE, OUTPUT_NODE} from "src/nodes/InputOutputNodes.js"


class EdgeActions extends QuantumStatement {
    /**
     * @param {!GeneralMap.<!int, !string>|!Map.<!int, !string>} changes Qubit to edge action kind.
     * @param {!boolean} useRootNodeEdgeAction
     */
    constructor(changes, useRootNodeEdgeAction) {
        super();
        this.changes = changes;
        this.useRootNodeEdgeAction = useRootNodeEdgeAction;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof EdgeActions &&
        equate(this.changes, other.changes) &&
        this.useRootNodeEdgeAction === other.useRootNodeEdgeAction);
    }

    /**
     * @param {!string} kind
     * @returns {*}
     * @private
     */
    _action(kind) {
        let nodeKind = NODES.map.get(kind);
        if (this.useRootNodeEdgeAction) {
            return nodeKind.nodeRootEdgeAction;
        }
        return nodeKind.edgeAction;
    }

    writeQasm(statements) {
        for (let [qubit, kind] of this.changes.entries()) {
            let ops = this._action(kind).qasmGates;
            for (let op of ops) {
                statements.push(`${op} q[${qubit}];`);
            }
        }
    }

    writeQuirk(init, cols) {
        let col = [];
        for (let [qubit, kind] of this.changes.entries()) {
            let quirkGate = this._action(kind).quirkGate;
            padSetTo(col, 1, qubit, quirkGate);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let [qubit, kind] of this.changes.entries()) {
            this._action(kind).sim(sim, qubit);
        }
    }
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _piDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '12px monospace';
        ctx.fillText('π', -3, 3);
    }
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _halfPiDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('π', -3, -1);
        ctx.fillText('2', -3, 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _negHalfPiDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('-π', -5, -1);
        ctx.fillText('2', -3, 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

/**
 * @param {!function(ctx: !CanvasRenderingContext2D)} drawers
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _concatDrawers(...drawers) {
    return ctx => {
        for (let drawer of drawers) {
            drawer(ctx);
        }
    }
}

/**
 * @param {!boolean} axis
 * @param {!boolean} post
 * @returns {!function(
 *     outProgram: !QuantumProgram,
 *     totalQubits: !int,
 *     qubitIds: !Array.<!int>,
 * ): !Array.<!TransformedMeasurement>}
 * @private
 */
function _spiderMeasurer(axis, post) {
    if (post) {
        return NO_ACTION_NODE_MEASURER;
    }
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
function* _iterNodeKinds() {
    for (let post of [false, true]) {
        for (let axis of [false, true]) {
            let nodeDraw = nodeDrawer(
                post ? 'red' : 'black',
                axis ? 'black' : 'white',
                post ? 3 : 1);
            let textColor = axis ? 'white' : 'black';
            let axisPostChar = axis ? '+' : '0';
            let axisAntiPostChar = axis ? '-' : '1';
            let spider = axis ? 'Z' : 'X';
            let oppSpider = axis ? 'X' : 'Z';
            let desc = (selected, modifier, sign, gate) => {
                if (post) {
                    return `postselect\n|${selected}⟩`;
                }
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

            let spiderTensor = phase => {
                let method = axis ? zBasisEqualityMatrix : xBasisEqualityMatrix;
                return dim => method(0, dim, phase);
            };

            let spiderFixedPoints = rootY => {
                if (post) {
                    return NO_FIXED_POINTS;
                }
                return deg => {
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
            };

            yield new ZxNodeKind({
                id: `${axis ? '@' : 'O'}${post ? '!' : ''}`,
                description: desc(axisPostChar, '', '', 'Identity'),
                diagramReps: (axis ? ['@'] : ['O', 'o', '0']).map(e => post ? e + '!' : e),
                contentDrawer: nodeDraw,
                hotkeys: post
                    ? (axis ? ['@', '2'] : ['O', ')', '0'])
                    : (axis ? ['2'] : ['o', '0']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(false),
                tensor: spiderTensor(0),
                edgeAction: NO_EDGE_ACTION,
                nodeMeasurer: _spiderMeasurer(!axis, post),
                postSelectStabilizer: !post ? undefined : axis ? '+X' : '+Z',
            });

            yield new ZxNodeKind({
                id: `${axis ? 'z' : 'x'}${post ? '!' : ''}`,
                description: desc(axisAntiPostChar, 'Flipped', '-', spider),
                diagramReps: (axis ? ['Z', 'z'] : ['X', 'x']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _piDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['Z'] : ['X'])
                    : (axis ? ['z'] : ['x']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(false),
                tensor: spiderTensor(Math.PI),
                edgeAction: post ? NO_EDGE_ACTION : {
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
                nodeMeasurer: _spiderMeasurer(!axis, post),
                postSelectStabilizer: !post ? undefined : axis ? '-X' : '-Z',
            });

            yield new ZxNodeKind({
                id: `${axis ? 's' : 'f'}${post ? '!' : ''}`,
                description: desc(axis ? 'i' : '-i', 'Phased', `-i${spider}0·`, axis ? 'S' : 'H·S·H'),
                diagramReps: (axis ? ['S', 's'] : ['F', 'f']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _halfPiDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['S'] : ['V'])
                    : (axis ? ['s'] : ['v']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(true),
                tensor: spiderTensor(Math.PI / 2),
                edgeAction: post ? NO_EDGE_ACTION : {
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
                nodeMeasurer: _spiderMeasurer(!axis, post),
                postSelectStabilizer: !post ? undefined : axis ? '-Y' : '+Y',
            });

            yield new ZxNodeKind({
                id: `${axis ? 'a' : 'w'}${post ? '!' : ''}`,
                description: desc(axis ? '-i' : 'i', 'Backphased', `i${spider}0·`, axis ? 'S†' : 'H·S†·H'),
                diagramReps: (axis ? ['A', 'a'] : ['W', 'w']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _negHalfPiDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['A'] : ['W'])
                    : (axis ? ['a'] : ['w']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(true),
                tensor: spiderTensor(-Math.PI / 2),
                edgeAction: post ? NO_EDGE_ACTION : {
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
                nodeMeasurer: _spiderMeasurer(!axis, post),
                postSelectStabilizer: !post ? undefined : axis ? '+Y' : '-Y',
            });
        }
    }

    yield new ZxNodeKind({
        id: '+',
        description: 'Crosser node',
        diagramReps: ['+', '-', '|'],
        contentDrawer: ctx => {
            // Empty space.
        },
        hotkeys: [],
        hotkeyShiftMask: undefined,
        mouseHotkey: undefined,
        allowedDegrees: [2, 4],
        fixedPoints: deg => {
            if (deg === 4) {
                return [
                    // HACK: This implicitly depends on the sorting order of edges being [left, top, down, right].
                    PauliProduct.fromString('X..X'),
                    PauliProduct.fromString('Z..Z'),
                    PauliProduct.fromString('.XX.'),
                    PauliProduct.fromString('.ZZ.'),
                ];
            }

            if (deg === 2) {
                return [PauliProduct.fromString('XX'), PauliProduct.fromString('ZZ')];
            }

            throw new Error('Invalid degree.');
        },
        tensor: () => {
            throw new Error('Crossing node tensor must be handled specially.');
        },
        edgeAction: NO_EDGE_ACTION,
        nodeMeasurer: () => {
            throw new Error('Crossing node tensor must be handled specially.');
        },
    });

    yield new ZxNodeKind({
        id: 'h',
        description: 'Hadamard\n\nSelection:\nX0·Z1\nZ0·X1\n\nAction:\nH',
        diagramReps: ['H', 'h'],
        contentDrawer: ctx => {
            ctx.fillStyle = 'yellow';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.fillRect(-5, -5, 10, 10);
            ctx.strokeRect(-5, -5, 10, 10);
        },
        hotkeys: ['h', 'H'],
        hotkeyShiftMask: undefined,
        mouseHotkey: undefined,
        allowedDegrees: [2],
        fixedPoints: deg => {
            if (deg !== 2) {
                throw new Error('Invalid degree.');
            }
            return [PauliProduct.fromString('XZ'), PauliProduct.fromString('ZX')];
        },
        edgeAction: {
            quirkGate: 'H',
            qasmGates: ['h'],
            sim: (sim, qubit) => {
                sim.hadamard(qubit);
            },
            matrix: Matrix.square(1, 1, 1, -1).times(Math.sqrt(0.5)),
        },
        nodeRootEdgeAction: NO_EDGE_ACTION,
        tensor: dim => {
            if (dim !== 2) {
                throw new Error(`Bad Hadamard dimension: ${dim}`);
            }
            return Matrix.square(1, 1, 1, -1).times(Math.sqrt(0.5));
        },
        nodeMeasurer: (outProgram, totalQubits, qubitIds) => {
            let [a, b] = qubitIds;
            outProgram.statements.push(new MultiCnot(a, [b], true, true));
            return [
                new TransformedMeasurement(
                    PauliProduct.fromSparseByType(totalQubits, {X: a, Z: b}),
                    new QubitAxis(a, false),
                    new QubitAxis(b, false)),
                new TransformedMeasurement(
                    PauliProduct.fromSparseByType(totalQubits, {X: b, Z: a}),
                    new QubitAxis(b, false),
                    new QubitAxis(a, false))
            ];
        },
    });

    yield INPUT_NODE;
    yield OUTPUT_NODE;
}

let map = /** @type {!GeneralMap.<!string, !ZxNodeKind>} */ new GeneralMap();
for (let e of _iterNodeKinds()) {
    map.set(e.id, e);
}
const NODES = {
    map: map,
    all: [...map.values()],
    cross: map.get('+'),
    in: map.get('in'),
    out: map.get('out'),
    x: map.get('O'),
    z: map.get('@'),
    white: map.get('O'),
    black: map.get('@'),
    h: map.get('h'),
};

export {NODES, EdgeActions}
